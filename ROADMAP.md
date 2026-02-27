# Roadmap

## Short-term

- [ ] Progress callback (report frame count / percentage during encoding)
- [ ] Cancellation support (abort an in-progress encode)
- [ ] Configurable bitrate (currently hardcoded: 3 Mbps iOS, 10 Mbps Android)
- [ ] Harmonize defaults between iOS and Android
- [ ] Input validation (reject odd dimensions before starting encode)
- [ ] JPEG input support (currently PNG-only)

## Medium-term

- [ ] Frame array input (array of file paths as alternative to folder)
- [ ] Auto-detect dimensions from first frame
- [ ] HEVC/H.265 codec option (smaller files, widely supported)
- [ ] Audio track muxing (combine pre-encoded audio with video)
- [ ] Quality presets (low/medium/high/custom)

## Long-term

- [ ] Streaming encode (feed frames one at a time, no temp directory needed)
- [ ] Skia integration helper (capture Skia canvas frames directly)
- [ ] Reanimated integration (drive animations frame-by-frame for export)
- [ ] GIF output format
- [ ] Web support via WebCodecs API
