# Phase 1 (MVP) Issues

- Milestone: Phase 1 (MVP) Release
- Global Labels: phase-1, enhancement
- Category Labels: setup, audio-engine, ui, logic

---

## Issue #1: [Setup] プロジェクトのファイル構造と基本設定 (SYS-01)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, setup, enhancement

### Body
`README.md` で定義されたファイル構造をローカルに作成し、基本的なHTMLとJSの連携を確認できる状態にする。

### 受入条件
- [ ] `index.html` が作成されている。
- [ ] `src/js/main.js` , `src/js/audio-engine.js` , `src/js/ui-handler.js` が作成され、`index.html` から読み込まれている。
- [ ] ブラウザで `index.html` を開いた際に、コンソールエラーが発生しない。

---

## Issue #2: [AE] 複数音源の同時再生 (AE-01)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, audio-engine, enhancement

### Body
複数のオーディオファイルをロードし、独立したトラックとして同時に再生・ループさせる機能を実装する。

### 受入条件
- [x] `AudioEngine` クラスに、複数のトラックを管理する機能がある。
- [x] 指定した複数の音源ファイルを非同期でロードできる。
- [x] すべてのロード済み音源を同時に再生開始できる。
- [x] 各音源はループ再生が可能である。

### 実装メモ（概要）
- `src/js/audio-engine.js`: HTMLAudioElement + MediaElementAudioSourceNode を採用し、`loadTrack(url, trackId)` で非同期ロード、`playAll()` で全トラックの同時スタート（未ロードは `pendingPlay` でロード完了時に開始）。
- ループは `media.loop = true` で実現。`pauseAll()` は全トラックを一時停止。

---

## Issue #3: [AE] トラック別音量制御 (AE-02)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, audio-engine, enhancement

### Body
再生中の各オーディオトラックの音量を個別に調整できる機能を実装する。

### 受入条件
- [x] `AudioEngine` クラスに、トラックIDや名前を指定して音量を変更するメソッドがある。
- [x] 音量値は 0.0 から 1.0 の間で設定できる。

### 実装メモ（概要）
- `setTrackVolume(trackId, volume)` を使用。各トラックの `gainNode` → `masterGain` → `destination` の経路で反映。

---

## Issue #4: [AE] マスター音量制御 (AE-03)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, audio-engine, enhancement

### Body
全トラックを統合的に制御するマスター音量（Master Gain）を実装する。

### 受入条件
- [x] `AudioEngine` にマスター音量を管理するゲインノード（`masterGain`）が存在する。
- [x] `setMasterVolume(volume)` メソッドがあり、0.0〜1.0 の範囲でリアルタイムに音量を変更できる。
- [x] マスター音量変更が、すべてのトラックに反映される。

### 実装メモ（概要）
- `masterGain` を `context.destination` に接続。各トラックの `gainNode` を `masterGain` に接続。

---

## Issue #5: [UI] 基本再生コントロール (UI-01)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, ui, enhancement

### Body
UI上に、全トラックの「再生」「一時停止（または停止）」を行う基本操作ボタンを実装し、`AudioEngine` に連携する。

### 受入条件
- [x] UIに「再生」「一時停止（停止）」ボタンが表示される。
- [x] 「再生」ボタンで `AudioEngine.playAll()` が呼び出される。
- [x] 「一時停止（停止）」ボタンで `AudioEngine.pauseAll()` が呼び出される。

### 実装メモ（概要）
- `index.html` のボタン群と `src/js/main.js` の `UIHandler` 連携で実現。

## Issue #6: [UI] マスター音量スライダー (UI-02)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, ui, enhancement

### Body
UI上に、0.0〜1.0 の範囲で操作できるマスター音量スライダーを実装し、`AudioEngine.setMasterVolume()` に連携する。

### 受入条件
- [x] マスター音量スライダーが表示され、操作可能である。
- [x] スライダーの値が変化すると、`AudioEngine.setMasterVolume(value)` が呼ばれる。
- [x] 現在値がUI上に表示される（例: 数値または%表示）。

### 実装メモ（概要）
- `UIHandler` の `onMasterVolumeChange` と `AudioEngine.setMasterVolume` を接続。

---

## Issue #7: [UI] トラック別音量スライダー (UI-03)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, ui, enhancement

### Body
ロードされた各トラックごとに音量スライダーを表示し、`AudioEngine.setTrackVolume(trackId, volume)` に連携する。

### 受入条件
- [x] トラックごとの音量スライダーUIが動的に生成・表示される。
- [x] スライダー操作で該当トラックの音量が変更される。
- [x] トラックIDや表示名がUI上で識別できる。

### 実装メモ（概要）
- `UIHandler.ensureTrackSlider()` により、サンプルトラック・DnD追加トラックともに動的生成。

---

## Issue #8: [Logic] タグベースの音源管理 (ML-01)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, logic, enhancement

### Body
音源にタグ（例: ambient, rain, piano など）を付与し、タグの組み合わせで再生セットを構築・切り替えできるロジックを実装する。

### 受入条件
- [x] 音源とタグのマッピングを保持するデータ構造が定義されている。
- [x] 指定タグ群で対象トラック一覧を取得できるAPI（関数）がある。
- [x] タグでフィルタしたトラック群をまとめてロード・再生開始できるユーティリティがある。

### 実装メモ（概要）
- `src/js/tag-library.js` を新規作成し、`TagLibrary`（id/url/label/tags管理）と `loadTracksByTags` ユーティリティを提供。
- `src/js/main.js` で `TagLibrary` を初期化し、サンプルトラック・DnD追加トラックをライブラリへ登録。`window.__library` と `window.__loadByTags` を公開。
- 例: `__loadByTags(['ambient'], 'AND', true)` で対象トラックをロードし、必要に応じて同時再生開始。

---

## Issue #9: [UI] ドラッグ＆ドロップで音声追加 (UI-04)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, ui, enhancement

### Body
ユーザーがローカルの音声ファイルをウィンドウへドラッグ＆ドロップすると、プレイヤーにトラックとして追加され、トラック別音量スライダーが生成される。追加したトラックはループ再生とマスター/個別音量制御の対象となる。

### 受入条件
- [ ] 画面にドロップゾーンが表示され、ドラッグ中はハイライトされる。
- [ ] 音声ファイル（複数同時可）をドロップするとトラックとして登録される（`AudioEngine.loadTrack(objectURL, trackId)`）。
- [ ] ドロップ直後に UI にトラック別スライダーが生成され、音量調整が可能。
- [ ] 不正なファイルは無視し、コンソールに警告を出す（アプリが落ちない）。
- [ ] 追加されたトラックは `playAll()/pauseAll()` に連動し、ループ再生される。

---

## Issue #10: [UI] 音源の波形表示機能 (UI-05)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, ui, enhancement

### Body
各トラックの再生状況（波形・再生位置）を視覚的に表示する。

### 受入条件
- [x] 各トラックに波形表示コンポーネント（Canvas等）が表示される。
- [x] 再生/一時停止に追従して再生位置インジケータが更新される。
- [x] DnDで追加されたトラックにも波形が表示される。
- [x] 表示は軽快に動作し（目安30〜60fps）、UI操作のレスポンスを阻害しない。

### 実装メモ（概要）
- `src/js/audio-engine.js`: 各トラックに `AnalyserNode` を追加（`gainNode` から分岐）
- `src/js/ui-handler.js`: トラックUIに `canvas.wave` を追加
- `src/js/waveform-renderer.js`: 軽量レンダラ（FPS上限・プレイヘッド線・リサイズ対応）
- `src/js/main.js`: レンダラ生成/管理。再生で start、一時停止で stop。DnD追加時も即時初期化

---

## Issue #11: [AE] クロスフェードループ機能 (AE-04)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, audio-engine, enhancement

### Body
トラックのループ再生時、つなぎ目で短いクロスフェードを行い、クリック音や段差を抑制する。

### 進捗（実装中）
- [x] Tone.js ベースのエンジンスケルトン追加（`src/js/tone-audio-engine.js`）
  - `Tone.GrainPlayer`/`Tone.Player` を想定、`playAll({reset})/pauseAll/stopAll` 等の互換API
  - `context` ゲッターでWebAudioコンテキストを公開（静的波形との互換のため）
- [x] エンジン切替ファクトリ（`src/js/engine-factory.js`）とクエリスイッチ（`?engine=tone`）
- [ ] ループ端のクロスフェード実装（Grainの `overlap` または2Player重ね再生）
- [ ] 既存UIとの完全連動検証（DnD/タグロード/音量制御）

### 受入条件
- [ ] フェード長（ms）を指定できる（デフォルト値あり）。
- [ ] ループ境界のクリック/段差が実用上目立たないレベルに低減される。
- [ ] 既存のマスター/トラック音量制御と競合しない。

---

## Issue #12: [AE][Experimental] ランダム・クロスフェードループ (AE-05)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, audio-engine, enhancement

### Body
ループ位置と長さをランダム化し、予測不能な音響を生成する。再生中のテクスチャが単調にならないよう工夫する。

### 受入条件
- [ ] ループ開始位置・長さを所定の範囲でランダム化できる（最小/最大の上下限を設定可能）。
- [ ] 同一シード値で再現可能なランダム化設定を提供（任意）。
- [ ] クロスフェードループ（#11）と組み合わせても破綻しない。

---

## Issue #13: [Architecture] エフェクト拡張の土台づくり (ARCH-01)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, audio-engine, logic, enhancement

### Body
将来的にリバーブやフィルタ等のエフェクトを追加可能にするため、拡張しやすいオーディオグラフ構成とインターフェースを整備する。

### 受入条件
- [ ] トラック/マスターそれぞれにエフェクトチェーンを差し替え可能な抽象インターフェースを定義。
- [ ] バイパス/有効化の切替APIを用意し、既存機能（再生・音量）と共存できる。
- [ ] 実装の最小例として、ダミー（ゲイン調整など）を1つ導入して動作確認。

---

## Issue #14: [UI] 静的オーバービュー波形の表示 (UI-06)

- Milestone: Phase 1 (MVP) Release  
- Labels: phase-1, ui, enhancement

### Body
SoundCloudのように、音声ファイル全体の形状を静的に表示する「オーバービュー波形」を追加する。リアルタイム波形（オシロスコープ）とは別に表示し、将来的には切替可能にする。

### 受入条件
- [x] 各トラックに静的波形のコンポーネント（Canvas等）が表示される。
- [x] 初回ロード時に非同期でデコードし、全体波形を描画する（進捗やプレースホルダー表示を含む）。
- [x] 再生位置に応じてオーバービュー上にプレイヘッドを重ねて表示できる。
- [x] 大きなファイルでもUI応答性を損なわない（分割バッチ処理で段階描画。今後必要に応じてWorker化）。

### 進捗（実装中）
- [x] UIに静的波形キャンバス（`canvas.wave-static`）を追加（`src/js/ui-handler.js`）
- [x] ピーク計算・描画ユーティリティを追加（`src/js/static-waveform.js`）
- [x] DnDファイルのデコード→ピーク抽出→描画を実装（`src/js/main.js`）
- [x] URL音源は http(s)/CORS 環境でベストエフォート対応（`computePeaksFromUrl`）
- [x] 再生/一時停止/停止/リサイズに連動（プレイヘッド更新・静止・リセット・再レイアウト）
- [ ] 大容量最適化（段階描画/ワーカー化）は次フェーズで検討
