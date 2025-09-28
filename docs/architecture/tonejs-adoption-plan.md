# Tone.js 採用検討と段階的移行計画

本ドキュメントは、Ambi-GenPlayer の将来機能（#10 波形表示、#11 クロスフェードループ、#12 ランダム・クロスフェード、#13 エフェクト拡張）を念頭に、Tone.js の導入可否と採用計画をまとめたものです。

## 現状（Phase 1）
- 実装方式: HTMLAudioElement + MediaElementAudioSourceNode + Gain（トラック/マスター）
- 長所: file:// でも動作・実装が容易
- 短所: サンプル精度の厳密同期・ループ端のクロスフェード等の高度制御が難しい

## Tone.js を採用するメリット
- `Tone.Player`/`Tone.GrainPlayer` によるループ制御、`loopStart`/`loopEnd`、`fadeIn`/`fadeOut`
- `Tone.Transport` による時間管理・同期再生
- 豊富なエフェクト（Reverb/Filter/Delay 等）とノードチェーンの抽象化
- スケジューラとパラメータオートメーションの簡易化

## 課題と考慮点
- バンドルサイズ増加
- 既存 HTMLAudioElement ベースとの共存戦略（段階移行）
- ライセンス: Tone.js は MIT（問題なし）

## 推奨アーキテクチャ
- `IAudioEngine`（抽象インターフェース; JSDocで定義）
  - `loadTrack(url, trackId)` / `loadTracks(entries)`
  - `playAll()` / `pauseAll()` / `startTrack(trackId, { reset })`
  - `setTrackVolume(trackId, v)` / `setMasterVolume(v)`
- 具体実装
  - 既存: `HtmlMediaAudioEngine`（現行 `AudioEngine`）
  - 追加: `ToneAudioEngine`（Tone.jsベース; 機能拡張用）
- 選択ファクトリ
  - `createAudioEngine({ impl: 'html' | 'tone' })` で切替

## 段階的移行計画
1. Phase 1.5（内部実験）
   - `ToneAudioEngine` のスケルトンを実装（`Tone.Gain` で master/track、`Tone.Player` で loop）
   - 既存 UI/ロジック（`UIHandler`/`TagLibrary`）はそのまま流用
2. Phase 2（#11 #12 #13 の土台）
   - ループ端クロスフェード（#11）
     - `Tone.GrainPlayer` の `overlap` / `grainSize` / `loopStart` / `loopEnd` を用いてクリックを軽減
     - もしくは `Tone.Player` を2本オーバーラップ起動でクロスフェード
   - ランダム・クロスフェード（#12）
     - 再生中に `loopStart/loopEnd` を一定レンジでランダム更新し、`overlap` を維持
     - オプションでシード指定（再現性）
   - エフェクト拡張（#13）
     - `EffectChain` 抽象とレジストリ
     - 初期装備: `Tone.Filter`, `Tone.Reverb`（スモールサイズ設定）
3. Phase 3（最適化）
   - バンドル分割とコード分岐（`import()` による遅延読み込み）
   - モバイル最適化（CPU負荷・バッテリー配慮）

## 波形表示（#10）の選択肢
- 最小実装: `AnalyserNode` + Canvas（再生中の波形/レベルメータ）
- 代替: Wavesurfer.js（高機能だがサイズ増）、後からの置換も可能
- 推奨: まず軽量な `AnalyserNode` + Canvas で開始し、後から差し替えできるよう抽象化

## 次アクション（提案）
- `IAudioEngine` の JSDoc 定義と `ToneAudioEngine` 雛形の作成（別ブランチ）
- #10 は `AnalyserNode` ベースで実装開始、将来 `Wavesurfer.js` へ拡張可能な構造に
- #11/#12 は Tone.js の採用前提で設計、既存エンジンでは簡易版のみ提供（将来置換）
