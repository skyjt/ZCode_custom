# Git wincred for aibuddy7se

Git 2.46.2 is retained for Windows 7. Its original wincred binary has upstream-confirmed buffer overruns in credential get, password-matching erase and OAuth store. This package replaces only that helper with unmodified Git upstream source at commit `f635ab9ab496ad710fec16f3d854e064110d158f`, which includes the fixes and the target-length bounds check.

The source URL and SHA-256 are pinned in `manifest.json` beside the offline tools. The downloaded source and this build definition are shipped in `git/sources/wincred`; Git's GPL license is retained in `git/LICENSE.txt`. Credential format and Windows Credential Manager ownership remain upstream's.

To rebuild the helper with Visual Studio 2022 x64 C tools and CMake, from this source directory:

```bat
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
```

The build selects static CRT, Windows 7 SDK target macros and subsystem 6.01. CI checks the resulting PE imports and exercises native credential store/get/erase, mismatched passwords, Unicode/OAuth fields and overlong targets. Real Windows 7 testing is still required; these settings alone are not proof of OS compatibility.
