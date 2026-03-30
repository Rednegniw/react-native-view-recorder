require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-view-recorder'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = package['homepage']
  s.license      = package['license']
  s.authors      = package['author']

  s.platforms    = { :ios => '13.0' }
  s.source       = { :git => package['repository']['url'], :tag => "v#{s.version}" }

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.exclude_files = 'ios/ObjCBridge/**/*', 'ios/ViewRecorder-Bridging-Header.h'
  s.header_dir = 'react_native_view_recorder'
  s.swift_version = '5.9'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.dependency 'React-Core'
end
