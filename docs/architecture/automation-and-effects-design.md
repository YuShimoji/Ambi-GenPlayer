# オートメーションとエフェクト管理の設計（草案）

本ドキュメントは、将来的な一括音量制御、音量・パラメータのアニメーション（オートメーション）、およびイコライザーやリバーブなどのエフェクトを安全かつ拡張しやすく管理するための設計草案です。

## 目的
- トラック/マスターそれぞれに対するパラメトリックな制御（音量・EQ・Reverbなど）を一貫したAPIで扱う。
- UI（スライダー/プリセット/シーン）とオーディオエンジン（WebAudio/Tone.js）の間を疎結合に保つ。
- 将来的に Tone.js へ移行しても、同じ抽象で運用できる。

## 概要アーキテクチャ
- Control Layer（制御層）
  - `AutomationEngine`（オートメーションのスケジューラ）
  - `EffectChain`（エフェクトチェーンの抽象）
  - `ParamRouter`（UIイベント/プリセットからオーディオパラメータへのルーティング）
- Audio Layer（音声層）
  - `IAudioEngine`（抽象） → 具象: `HtmlMediaAudioEngine`（現行）/ `ToneAudioEngine`（将来）
  - トラック: `TrackNode`（gain, analyser, [future: effectChain]）
  - マスター: `MasterNode`（masterGain, [future: effectChain]）

## インターフェース（案）

### IAudioEngine（既存の拡張）
- `loadTrack(url, id)` / `startTrack(id, { reset })` / `playAll()` / `pauseAll()`
- `setTrackVolume(id, value)` / `setMasterVolume(value)`
- 追加（案）:
  - `getAudioParam(ref)` → 内部パラメータ参照（Tone.js では `Tone.Param`、WebAudio では `AudioParam` など）
  - `attachEffectChain(scope, chain)` → scope: `track:<id>` / `master` にチェーンを挿入

### EffectChain
```ts
interface EffectUnit {
  id: string
  type: 'filter' | 'reverb' | 'eq' | 'gain' | 'custom'
  params: Record<string, number>
  bypass?: boolean
}
interface EffectChain {
  units: EffectUnit[]
  setBypass(id: string, bypass: boolean): void
  setParam(id: string, key: string, value: number): void
}
```
- HtmlMedia版では最小構成（gain等）で代替、Tone版では `Tone.Filter`, `Tone.Reverb` 等を利用。

### AutomationEngine
```ts
interface AutomationClip {
  id: string
  target: string // 例: 'track:track1.gain', 'master.gain', 'track:track2.filter.frequency'
  mode: 'linear' | 'step' | 'curve' | 'lfo'
  data: Array<{ t: number; v: number }>
  loop?: { enabled: boolean; start: number; end: number }
}
```
- 機能:
  - クリップの登録/解除、再生/停止/シーク
  - `ParamRouter` を介して `IAudioEngine` のパラメータへ反映
  - LFO/包絡などのリアルタイム生成モードをサポート

### ParamRouter
- `"track:track1.gain" → AudioParam` のように、文字列キーからパラメータ実体へ解決。
- ルーティング表は `TagLibrary` と連携し、タグ単位の一括制御（例: `tag:ambient.gain`）も可能に。

## データモデル（プリセット/シーン）
- `Preset`（単一状態の保存）
- `Scene`（時間帯や状況に応じたプリセット遷移とオートメーションの組合せ）
- JSONでエクスポート/インポートできるフォーマットを用意。

## 実装段階（提案）
1. Phase 2（基盤）
   - `IAudioEngine` 拡張を宣言（JSDoc）
   - `EffectChain` 抽象・最小ユニット（gain）を導入（HtmlMedia版でダミー運用）
   - `ParamRouter` の最小実装： `master.gain` と `track:<id>.gain` を解決
2. Phase 2.5（オートメーション入門）
   - `AutomationEngine` の雛形（linear/step） + 再生/停止/シーク
   - UI から簡易クリップを起動（例: 10秒で 1.0→0.5）
3. Phase 3（Tone.js導入と拡張）
   - `ToneAudioEngine` に対応する `EffectChain` 実装（Filter/Reverb）
   - LFO/包絡、タグ単位制御、シーン切替

## テスト戦略（要点）
- 各レイヤーはユニットテスト（構造が安定次第）
- ブラウザE2E: UI操作→ParamRouter→オーディオ変化の目視とログ検証
- パフォーマンス: FPS/メインスレッドブロック時間、AudioWorklet/Toneの負荷評価
