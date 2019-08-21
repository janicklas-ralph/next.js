import { join } from 'path'
import { loadPartialConfig, TransformOptions, ConfigItem } from '@babel/core'
import semver from 'semver'
import getTargets from '@babel/preset-env/lib/targets-parser'

type TargetObject = { [key: string]: string }
type BrowserTargets = TargetObject | string | string[]
type NextBabelPresetOptions = {
  'preset-env'?: {
    targets?: BrowserTargets
  }
}

const moduleBrowsers: TargetObject = {
  chrome: '61.0.0',
  edge: '16.0.0',
  firefox: '60.0.0',
  ios: '10.3.0',
  opera: '48.0.0',
  safari: '10.1.0',
}

export function parseTargetConfig(config: TransformOptions) {
  const nextPreset =
    config.presets &&
    (config.presets.find(
      preset =>
        preset && (preset as ConfigItem).value === require('./babel/preset')
    ) as ConfigItem)

  const nextPresetOptions = (nextPreset &&
    nextPreset.options) as NextBabelPresetOptions

  let targets: BrowserTargets = ''

  if (
    nextPresetOptions['preset-env'] &&
    nextPresetOptions['preset-env'].targets
  ) {
    targets = nextPresetOptions['preset-env'].targets
  }

  if (typeof targets === 'string' || Array.isArray(targets)) {
    return { browsers: targets }
  }

  return {
    ...targets,
  }
}

export function countModernTargets(targets: TargetObject) {
  return Object.entries(targets).reduce((count, [browser, version]) => {
    if (
      moduleBrowsers[browser] &&
      !semver.lt(version, moduleBrowsers[browser])
    ) {
      count += 1
    }

    return count
  }, 0)
}

export function shouldEnableModernBuild(cwd: string) {
  const config = loadPartialConfig({ filename: join(cwd, 'pages') })

  if (!config) return true

  const targets = parseTargetConfig(config.options)

  const normalizedTargets: TargetObject = getTargets(targets)

  const modernTargetsCount = countModernTargets(normalizedTargets)

  return !(
    modernTargetsCount === 0 ||
    modernTargetsCount === Object.keys(normalizedTargets).length
  )
}
