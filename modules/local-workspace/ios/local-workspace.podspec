Pod::Spec.new do |s|
  s.name           = 'local-workspace'
  s.module_name    = 'LocalWorkspace'
  s.version        = '1.0.0'
  s.summary        = 'On-device Codaloud files and Git operations'
  s.description    = 'Expo bindings for the shared libgit2 workspace engine.'
  s.author         = 'Codaloud'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: 'https://github.com/Danieldkdao/codaloud.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
  }

  s.source_files = '*.{h,mm,swift}'
  s.public_header_files = 'local-workspace-bridge.h'
  s.vendored_frameworks = 'Frameworks/CodaloudWorkspace.xcframework'
  s.resource_bundles = { 'CodaloudWorkspaceNotices' => ['../licenses/*.txt'] }
  s.frameworks = 'Security', 'CoreFoundation'
  s.libraries = 'c++', 'z', 'iconv'
end
