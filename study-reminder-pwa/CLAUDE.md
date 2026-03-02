# StudyCat PWA - Claude開発ガイド

## プロジェクト概要

中学生向け受験勉強サポートPWA。猫マスコット「StudyCat」が学習を応援する。

**コンセプト**: 試験日までのカウントダウン × ゲーミフィケーション × 非懲罰的デザイン

---

## ディレクトリ構造

```
study-reminder-pwa/
├── index.html          # ホーム（カウントダウン、猫、今日の予定）
├── setup.html          # 初期設定（試験日、塾曜日、勉強時間）
├── setup-subjects.html # 教科設定（9教科、重要度: 低/中/高）
├── timer.html          # タイマー画面（開始/一時停止/再開/停止）
├── review.html         # 振り返り画面（総時間調整、科目分配）
├── input.html          # 勉強記録入力（レガシー、ナビから除外）
├── progress.html       # 進捗確認（統計、教科別、週間サマリー）
├── settings.html       # 設定・バックアップ・リセット
├── manifest.json       # PWAマニフェスト
├── sw.js               # Service Worker（Cache First、v2）
├── css/
│   └── style.css       # 統一スタイル（モバイルファースト）
├── js/
│   ├── app.js          # メインアプリ（初期化、ログ追加、バックアップ）
│   ├── storage.js      # IndexedDB/LocalStorageラッパー（v2）
│   ├── calculator.js   # 計算ロジック（残り日数、配分、進捗率、ボーナス）
│   ├── cat.js          # 猫システム（状態、レベル、ストリーク、メッセージ）
│   └── timer.js        # タイマーロジック（状態管理、localStorage永続化）
└── images/
    └── icon-192.svg    # アプリアイコン
```

---

## アーキテクチャ

### モジュール構成
| ファイル | シングルトン | 役割 |
|----------|--------------|------|
| storage.js | `StorageManager` | データ永続化（IndexedDB優先） |
| calculator.js | `Calculator` | 日数・時間・進捗・ボーナスの計算 |
| cat.js | `CatSystem` | マスコット状態管理 |
| timer.js | `TimerManager` | タイマー状態管理（localStorage永続化） |
| app.js | `App` | 統合・初期化・UI連携 |

### 依存関係
```
HTML → storage.js → calculator.js → cat.js → timer.js → app.js → sw.js
```

### 実行フロー
1. HTML読み込み → JS順次読み込み
2. `DOMContentLoaded` → `App.init()`
3. Storage初期化 → データロード → 設定チェック
4. 未設定 → setup.htmlへリダイレクト
5. Service Worker登録

---

## データ構造（IndexedDB: StudyCatDB v2）

### config
```javascript
{
  id: 'main',
  examDate: 'YYYY-MM-DD',       // 試験日
  startDate: 'YYYY-MM-DD',      // 学習開始日
  bufferDays: 7,                // 余裕日数
  weeklyHours: {                // 曜日別学習時間
    monday: 3.0, tuesday: 1.5, ...
  },
  cramSchoolDays: ['tuesday', 'thursday', 'saturday']
}
```

### subjects
```javascript
{
  id: 'uuid',
  name: '数学',
  color: '#FF5733',
  weight: 7,                    // 低:2, 中:5, 高:7
  totalPlanned: 0,
  totalActual: 0
}
```

### studyLogs
```javascript
{
  id: 'uuid',
  date: 'YYYY-MM-DD',
  subjectId: 'uuid',
  subjectName: '数学',
  plannedMinutes: 120,
  actualMinutes: 150
}
```

### catState
```javascript
{
  id: 'main',
  currentState: 'happy',        // happy/cheering/worried/sleeping/celebrating
  level: 1,                     // 1-5
  experience: 0,                // XP（分÷5 + ボーナス）
  totalStudyMinutes: 0,
  streakDays: 0,
  lastStudyDate: 'YYYY-MM-DD',
  unlockedItems: []             // 未実装
}
```

### timerSessions（v2で追加）
```javascript
{
  id: 'uuid',
  date: 'YYYY-MM-DD',
  startTime: 'ISO8601',
  endTime: 'ISO8601',
  totalSeconds: 3600,           // 実測（一時停止除外）
  adjustedSeconds: 3900,        // ユーザー調整後
  pauseCount: 2,
  status: 'completed',          // active | paused | completed
  distributions: [              // 科目別配分
    { subjectId: 'xxx', minutes: 30 }
  ],
  bonusXP: 12
}
```

### localStorage（タイマー進行中）
```javascript
studycat_activeTimer: {
  sessionId, startTime, accumulatedSeconds,
  lastResumeTime, status, pauseCount
}
```

---

## タイマー機能

### フロー
```
timer.html（計測）→ review.html（振り返り入力）→ index.html
```

### TimerManager API
- `init()` - localStorageから状態復元
- `start()` - 新規タイマー開始
- `pause()` - 一時停止
- `resume()` - 再開
- `stop()` - 終了（sessionDataを返す）
- `getElapsedSeconds()` - 経過秒数取得
- `formatTime(seconds)` - HH:MM:SS形式
- `formatReadable(seconds)` - "1時間23分"形式

### 目標超過ボーナス
```javascript
Calculator.calculateGoalBonus(excessMinutes)
// 超過10分ごとに1XP（上限20XP）
```

---

## 猫システム詳細

### 状態遷移
| 状態 | 条件 | 絵文字 |
|------|------|--------|
| sleeping | 深夜・早朝 | 😴 |
| celebrating | 進捗率 ≥ 100% | 🎉 |
| happy | 進捗率 ≥ 80% | 😊 |
| cheering | 進捗率 50-80% | 📣 |
| worried | 進捗率 < 50% | 😟 |

### レベルシステム
| レベル | 必要時間 |
|--------|----------|
| 1 | 0時間 |
| 2 | 50時間 |
| 3 | 150時間 |
| 4 | 300時間 |
| 5 | 500時間 |

---

## 実装状況

### 完了
- [x] 初期設定フロー（試験日、塾、教科）
- [x] 学習記録の入力・保存
- [x] 進捗率計算・表示
- [x] 貯金機能（計画超過追跡）
- [x] 猫マスコット（状態変化、メッセージ）
- [x] レベル・ストリークシステム
- [x] バックアップ/復元
- [x] PWAオフライン対応
- [x] **タイマー機能**（計測→振り返り→記録）
- [x] **目標超過ボーナスXP**

### 未実装（優先度順）
1. **フェーズシステム** → `phase_system_design.md` 参照
2. **通知機能** - Web Push
3. **アンロック要素** - `unlockedItems`は定義のみ
4. **バッジシステム**
5. **詳細グラフ表示**

---

## 開発ガイドライン

### コーディング規約
- **シングルトンパターン**: 各モジュールは即時関数で定義
- **async/await**: IndexedDB操作は非同期
- **日付形式**: `YYYY-MM-DD`（Calculator.getTodayString()使用）
- **ID生成**: `StorageManager.generateId()`（UUID v4風）

### UI/スタイル
- **カラー**: プライマリ `#4CAF50`（緑）
- **フォント**: システムフォント
- **レスポンシブ**: モバイルファースト、max-width: 600px
- **notch対応**: safe-area-inset使用

### 変更時の注意
1. `sw.js`のキャッシュリスト更新を忘れない
2. IndexedDBスキーマ変更時はバージョン番号を上げる
3. 新ページ追加時はナビゲーション更新

---

## 次のマイルストーン: フェーズシステム

`../phase_system_design.md` に基づく実装計画:

1. `calculator.js` に `PhaseSystem` 追加
2. `index.html` にフェーズ表示UI追加
3. `cat.js` にフェーズ連動アクセサリー追加
4. フェーズ別科目ローテーションロジック
5. アンロック要素の保存/表示
6. バッジシステム実装

---

## 関連ファイル

- `../phase_system_design.md` - フェーズシステム設計書
- `../tasks/todo.md` - 現在のタスクリスト
- `../tasks/lessons.md` - 学んだ教訓

---

*最終更新: 2026-03-02*
