/**
 * MIT License
 *
 * Copyright (c) 2018 Prateek Bhatnagar
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Original source from which this was built upon - https://github.com/prateekbh/babel-esm-plugin
 */

const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin')
const JsonpTemplatePlugin = require('webpack/lib/web/JsonpTemplatePlugin')
const SplitChunksPlugin = require('webpack/lib/optimize/SplitChunksPlugin')
const RuntimeChunkPlugin = require('webpack/lib/optimize/RuntimeChunkPlugin')

const PLUGIN_NAME = 'NextEsmPlugin'
const FILENAME = '[name].es6.js'
const CHUNK_FILENAME = '[id].es6.js'

export default class NextEsmPlugin {
  constructor (options) {
    this.options_ = Object.assign(
      {
        filename: FILENAME,
        chunkFilename: CHUNK_FILENAME,
        excludedPlugins: [PLUGIN_NAME],
        additionalPlugins: []
      },
      options
    )
  }

  apply (compiler) {
    compiler.hooks.make.tapAsync(PLUGIN_NAME, (compilation, callback) => {
      this.runBuild(compiler, compilation).then(callback)
    })
  }

  getBabelLoader (rules) {
    for (let rule of rules) {
      if (!rule.use) continue

      if (Array.isArray(rule.use)) {
        return rule.use.find(r => r.loader.includes('next-babel-loader'))
      } else if (
        (rule.use.loader && rule.use.loader.includes('next-babel-loader')) ||
        rule.loader.includes('next-babel-loader')
      ) {
        return rule.use || rule
      }
    }

    throw new Error('Babel-loader config not found!!!')
  }

  updateOptions (childCompiler) {
    let babelLoader = this.getBabelLoader(childCompiler.options.module.rules)

    babelLoader.options = { ...babelLoader.options, isModern: true }
  }

  updateAssets (compilation, childCompilation) {
    compilation.assets = Object.assign(
      childCompilation.assets,
      compilation.assets
    )

    compilation.namedChunkGroups = Object.assign(
      childCompilation.namedChunkGroups,
      compilation.namedChunkGroups
    )

    const childChunkFileMap = childCompilation.chunks.reduce(
      (chunkMap, chunk) => {
        chunkMap[chunk.name] = chunk.files
        return chunkMap
      },
      {}
    )

    compilation.chunks.forEach((chunk, index) => {
      const childChunkFiles = childChunkFileMap[chunk.name]

      if (childChunkFiles) {
        chunk.files.push(
          ...childChunkFiles.filter(v => !chunk.files.includes(v))
        )
      }
    })
  }

  async runBuild (compiler, compilation) {
    const outputOptions = { ...compiler.options.output }

    // Handle functions as input to filenames
    if (typeof this.options_.filename === 'function') {
      outputOptions.filename = this.options_.filename(outputOptions.filename)
    } else {
      outputOptions.filename = this.options_.filename
    }

    // Option (as a function) to override the chunkFilename
    if (typeof this.options_.chunkFilename === 'function') {
      outputOptions.chunkFilename = this.options_.chunkFilename(
        outputOptions.chunkFilename
      )
    } else {
      outputOptions.chunkFilename = this.options_.chunkFilename
    }

    let plugins = (compiler.options.plugins || []).filter(
      c => !this.options_.excludedPlugins.includes(c.constructor.name)
    )

    // Add the additionalPlugins
    plugins = plugins.concat(this.options_.additionalPlugins)

    /**
     * We are deliberatly not passing plugins in createChildCompiler.
     * All webpack does with plugins is to call `apply` method on them
     * with the childCompiler.
     * But by then we haven't given childCompiler a fileSystem or other options
     * which a few plugins might expect while execution the apply method.
     * We do call the `apply` method of all plugins by ourselves later in the code
     */
    const childCompiler = compilation.createChildCompiler(
      PLUGIN_NAME,
      outputOptions
    )

    childCompiler.context = compiler.context
    childCompiler.inputFileSystem = compiler.inputFileSystem
    childCompiler.outputFileSystem = compiler.outputFileSystem

    // Call the `apply` method of all plugins by ourselves.
    if (Array.isArray(plugins)) {
      for (const plugin of plugins) {
        plugin.apply(childCompiler)
      }
    }

    let compilerEntries = compiler.options.entry
    if (typeof compilerEntries === 'function') {
      compilerEntries = await compilerEntries()
    }
    if (typeof compilerEntries === 'string') {
      compilerEntries = { index: compilerEntries }
    }

    Object.keys(compilerEntries).forEach(entry => {
      const entryFiles = compilerEntries[entry]
      if (Array.isArray(entryFiles)) {
        new MultiEntryPlugin(compiler.context, entryFiles, entry).apply(
          childCompiler
        )
      } else {
        new SingleEntryPlugin(compiler.context, entryFiles, entry).apply(
          childCompiler
        )
      }
    })

    // Convert entry chunk to entry file
    new JsonpTemplatePlugin().apply(childCompiler)

    const optimization = compiler.options.optimization
    if (optimization) {
      if (optimization.splitChunks) {
        new SplitChunksPlugin(
          Object.assign({}, optimization.splitChunks)
        ).apply(childCompiler)
      }

      if (optimization.runtimeChunk) {
        new RuntimeChunkPlugin(
          Object.assign({}, optimization.runtimeChunk)
        ).apply(childCompiler)
      }

      if (optimization.minimize) {
        for (const minimizer of optimization.minimizer) {
          minimizer.apply(childCompiler)
        }
      }
    }

    compilation.hooks.additionalAssets.tapAsync(
      PLUGIN_NAME,
      childProcessDone => {
        this.updateOptions(childCompiler)

        childCompiler.runAsChild((err, entries, childCompilation) => {
          if (!err) {
            this.updateAssets(compilation, childCompilation)
          }

          err && compilation.errors.push(err)
          childProcessDone()
        })
      }
    )
  }
}
