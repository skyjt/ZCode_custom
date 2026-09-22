#!/usr/bin/env bash
set -euo pipefail

version=$(node -p 'require("./package.json").version')
tag="v$version"
cd release
cat checksums-*.txt > SHA256SUMS
test "$(wc -l < SHA256SUMS)" -eq 5
sha256sum --check SHA256SUMS
files=("AIbuddy-$version-linux-x64.deb" "AIbuddy-$version-linux-arm64.deb" \
       "AIbuddy-$version-win-x64.exe" "AIbuddy-$version-mac-x64.dmg" "AIbuddy-$version-mac-arm64.dmg" SHA256SUMS)
for file in "${files[@]}"; do test -s "$file"; done

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
if git rev-parse --verify "refs/tags/$tag" >/dev/null 2>&1; then
  test "$(git rev-parse "$tag^{commit}")" = "$GITHUB_SHA"
else
  git tag -a "$tag" "$GITHUB_SHA" -m "AIbuddy $tag"
  git push origin "refs/tags/$tag"
fi

if gh release view "$tag" --json isDraft > release-state.json 2>/dev/null; then
  node -e 'if (!require("./release-state.json").isDraft) throw new Error("Release is already public; refusing to replace assets")'
else
  gh release create "$tag" --verify-tag --draft --title "AIbuddy $tag" --notes-file ../scripts/release/release-notes.md
fi
gh release upload "$tag" "${files[@]}" --clobber
gh release view "$tag" --json assets > release-state.json
node -e 'const a=require("./release-state.json").assets; if(a.length!==6 || a.some(x=>x.size<=0)) throw new Error("Incomplete release assets")'
gh release edit "$tag" --draft=false --prerelease=false --latest
