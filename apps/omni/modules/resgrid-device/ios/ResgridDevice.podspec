Pod::Spec.new do |s|
  s.name           = 'ResgridDevice'
  s.version        = '1.0.0'
  s.summary        = 'Resgrid Omni device helpers: backup exclusion and spoken-prompt audio ducking'
  s.description    = 'Local Expo module for Resgrid Omni (MapLibre plan §19.5 backup exclusion, §9.2 voice prompts).'
  s.license        = 'Apache-2.0'
  s.author         = 'Resgrid'
  s.homepage       = 'https://resgrid.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
