## Final Review Fix - Model Capability Honesty

- Changed `modelCapability` so `mmproj` means `视觉投影已配置`, not guaranteed image understanding.
- Added vision-hint handling from modalities, family, and model name; vision-hinted models without `mmproj` now show `需要 mmproj`.
- Updated the image support row to say `已配置 mmproj，需实测模型支持`, `需要 mmproj`, or `未确认支持`.
- Added RED-first tests for stale/text `mmproj`, missing `mmproj` on vision-hinted models, and cautious UI source copy.
