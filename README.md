# Ambi-GenPlayer: 自動音楽再生Webツール

将来的に小説ページ等へ埋め込み可能なWebプレイヤーとしても、独立ページとしても動作することを目指す、アンビエント自動再生ツールです。Phase 1 (MVP) では複数トラックの同時再生と基本UIを提供します。

## 目的（Phase 1 / MVP）
- 複数音源の同時再生・ループ
- マスター音量・トラック別音量の制御
- 基本的な再生/一時停止UI
- タグベースの音源管理の基盤

## ファイル/ディレクトリ構成
```
Ambi-GenPlayer/
├─ index.html
├─ README.md
├─ docs/
│  └─ issues/
│     └─ phase-1-mvp-issues.md
├─ assets/
│  └─ audio/
│     └─ README.txt  (任意の音源ファイルを配置: sample1.mp3, sample2.mp3 など)
└─ src/
   └─ js/
      ├─ main.js
      ├─ audio-engine.js
      ├─ ui-handler.js
      └─ tag-library.js
```

## クイックスタート
1. `assets/audio/` にローカルのサンプル音源（例: `sample1.mp3`, `sample2.mp3`）を配置します。
2. `index.html` をブラウザで開きます。
3. コンソールエラーがないことを確認し、UIのボタンやスライダーを操作して挙動を確認します。
   - ブラウザの自動再生ポリシーにより、音声を再生するにはユーザー操作（ボタン押下）が必要です。

### サンプルトラックの有効化（任意）
`src/js/main.js` の下記フラグを `true` に変更してください。

```js
const ENABLE_SAMPLE_TRACKS = true;
```

`assets/audio/` に `sample1.mp3`, `sample2.mp3` を配置後、ページを更新するとトラックスライダーが表示され、`再生` ボタンで同時再生・ループが始まります。

### コンソールからの手動テスト
`index.html` を開いた状態で、ブラウザの開発者コンソールから次のように操作できます。

```js
// AudioEngine インスタンス
window.__audioEngine

// トラックのロード（任意のファイル名に変更可）
await __audioEngine.loadTrack('./assets/audio/sample1.mp3', 'track1');
await __audioEngine.loadTrack('./assets/audio/sample2.mp3', 'track2');

// 再生/一時停止
__audioEngine.playAll();
__audioEngine.pauseAll();

// 音量
__audioEngine.setMasterVolume(0.8);
__audioEngine.setTrackVolume('track1', 0.5);
```

### ドラッグ＆ドロップで音声追加
`index.html` にはドロップゾーン（「ここに音声ファイル（audio/*）をドロップ」）があります。ここにローカルの音声ファイルをドラッグ＆ドロップすると、各ファイルが新規トラックとして追加されます。

- 対応拡張子: `.mp3`, `.wav`, `.ogg`, `.oga`, `.opus`, `.webm`, `.m4a`, `.aac`, `.flac` など（`audio/*` MIME も許可）
- 追加後: トラック別スライダーが自動生成され、`再生/一時停止`・マスター/個別音量に連動します。
- 再生中にドロップした場合: 新規トラックは即時再生（現在の再生に追従）します。
- 追加はブラウザ内の一時URL（Object URL）として扱われ、ローカル再生に利用されます。

### タグベース音源管理（Issue #8）
`TagLibrary` によって、音源をタグでグルーピングし、タグ指定で一括ロード・再生できます。サンプルトラックとDnD追加トラックは自動的にライブラリに登録されます（例: `sample`, `ambient`, `drop`）。

コンソール例:

```js
// ライブラリ参照
__library.getAll();
__library.listTags();          // 既存タグ一覧

// タグでロードして再生（AND検索）
await __loadByTags(['ambient'], 'AND', true);

// OR検索でロードのみ（自動再生なし）
await __loadByTags(['drop', 'ambient'], 'OR', false);
```

## 開発ガイド
- ES Modules（`<script type="module">`）で `src/js/main.js` を読み込み、そこから各クラスをインポートします。
- コーディング原則: SRP/DRY/KISS、YAGNI、命名規則と名前空間の明確化を遵守。
- Linter/Formatter: 本MVPでは未導入。将来的に ESLint / Prettier / Husky を導入予定。

## 今後の拡張
- Tone.js 採用検討と段階的移行計画: `docs/architecture/tonejs-adoption-plan.md`
- 埋め込み向け: iframe/Widgetとしての最小バンドル提供
- プリセット/シーン機能（時間帯やタグで自動切替）
- フェードイン/アウト、クロスフェード
- プリロード戦略とキャッシュ
