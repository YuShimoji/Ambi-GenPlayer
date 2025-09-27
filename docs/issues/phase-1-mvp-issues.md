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
- [ ] 音源とタグのマッピングを保持するデータ構造が定義されている。
- [ ] 指定タグ群で対象トラック一覧を取得できるAPI（関数）がある。
- [ ] タグでフィルタしたトラック群をまとめてロード・再生開始できるユーティリティがある。

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
