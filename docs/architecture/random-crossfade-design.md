# Issue #12: ランダム・クロスフェード設計ドキュメント

## 目的
- ループ再生中に `loopStart` / `loopEnd` を動的に更新し、音響テクスチャに揺らぎを与える。
- ユーザー指定の範囲・シード・ランダマイズ頻度をもとに Tone.js エンジン側でスケジューリングする。
- #11 のクロスフェード実装（Grain / 2Player）と両立させ、滑らかな遷移を維持。

## 要件整理
- **レンジ指定**: `startMin`, `startMax`, `lengthMin`, `lengthMax` を秒単位で設定。
- **クロスフェード整合**: 新ループ長はクロスフェード秒数の 2× 以上を確保し、退避。
- **乱数シード**: 省略時は `Math.random()` / 指定時は `mulberry32(seed)` のような軽量PRNG。
- **頻度**: ループ切り替え毎 or 固定間隔（例: n ループごと / 秒ごと）を選択可。
- **UI**: エンジン設定セクションに「ランダム・クロスフェード」トグルと範囲入力、シード入力、頻度選択を追加。初期値はOFF。
- **同期**: 変更時は即時エンジンへ反映し、再生中も次サイクルから適用。
- **HTMLエンジン互換**: APIは受け付けるが no-op。Toneエンジンで実行。

## 提案API
### UI構成値
```ts
interface RandomCrossfadeSettings {
  enabled: boolean;
  startMin: number;   // 秒 (>= 0)
  startMax: number;   // 秒 (> startMin, <= trackDuration)
  lengthMin: number;  // 秒 (>= crossfade * 2)
  lengthMax: number;  // 秒 (> lengthMin)
  mode: 'perLoop' | 'interval';
  intervalSeconds?: number; // mode === 'interval'
  seed?: number | null;
}
```

### エンジンAPI（`ToneAudioEngine`）
- `setRandomLoopConfig(trackId, config)`
- `setRandomLoopGlobalConfig(config)` : 全トラック既定値。
- `disableRandomLoop(trackId)`
- `getRandomLoopState(trackId)` : デバッグ用（現在の loopStart/loopEnd, seed 状態）。

`createAudioEngine()` で返すインスタンスに以下を追加:
```ts
interface RandomLoopCapableEngine extends AudioEngine {
  setRandomLoopConfig(trackId: string, config: RandomCrossfadeSettings): void;
  setRandomLoopGlobalConfig(config: RandomCrossfadeSettings): void;
  disableRandomLoop(trackId: string): void;
}
```
HTMLエンジンでは警告ログ＋ no-op。

### スケジューリング案
- Tone.js `Tone.Player` デュアル方式を拡張。
- プレイヤー A/B の再スケジューリング時に乱数生成 -> 新しい `loopStart`, `loopEnd = loopStart + loopLength` を決定。
- ループ長 < crossfade*2 を回避。必要なら `lengthMin` を動的修正。
- `mode`:
  - `perLoop`: A→B 切り替え時ごとに新値を生成。
  - `interval`: `intervalSeconds` 経過ごとに (Transport 時刻参照) 新値を生成。
- シードは track ごとに内部保持 (`seedState = seed ?? Math.random()*2^32`)、 PRNG に `mulberry32` を採用。

### データ保持
- `tracks.get(trackId)` に `randomLoop` オブジェクトを追加。
```ts
randomLoop: {
  enabled: boolean;
  config: RandomCrossfadeSettings;
  rng: () => number; // 0..1
  nextUpdateTime?: number; // Tone.now 工作用
}
```

## UI 仕様
- `index.html` > `#engine-visual` 内に以下を追加。
  - トグル: 「ランダム・クロスフェード」`#randomCrossfadeToggle`
  - 折りたたみセクション: 範囲スライダー／入力
    - `start` (Min/Max), `length` (Min/Max) → number inputs (step 0.1 秒)
    - モード選択: `perLoop` / `interval`
    - 間隔入力（秒）
    - シード（整数）
  - UI 値は LocalStorage に保存。Tone エンジン時のみ有効。

- `UIHandler` に以下を追加:
  - `onRandomCrossfadeToggle(handler: (enabled: boolean) => void)`
  - `onRandomCrossfadeConfigChange(handler: (config: RandomCrossfadeSettings) => void)`

- `main.js` にて:
  - UI -> エンジンへ設定反映。
  - エンジンからの例外は警告ログ。

## テスト戦略
- **単体**: PRNG の再現性テスト（同シードで同順序）。
- **統合**:
  - クロスフェード=100ms, lengthMin=0.6s, lengthMax=1.5s で10 ループ実行。ループ境界でクリックが無いことを耳で確認。
  - `interval` モードで Interval=5s に設定し、再生を継続したまま区間変更されることを確認。
  - トグル OFFで固定ループへ戻る。
  - `?engine=html` では警告ログのみ。
- **UX**: フォーム値のシリアライズ/ローカルストレージ復元が機能すること。

## 依存事項
- #11 クロスフェード済みの ToneAudioEngine。
- 今後の #13 エフェクト土台の設計とも整合するよう、エンジンAPI拡張は抽象インターフェース `IAudioEngine` へ反映予定。

## 実装優先度
1. `ToneAudioEngine` に乱数ループ管理ロジックを追加。
2. UI/Handler/Storage の追加。
3. HTML エンジン側は no-op スタブ。
4. テストとデバッグログ。
