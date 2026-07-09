第一梯隊:直接複用我們已有的架構,價值最高
1. PalDefender 設定面板(Config.json)

這是最明顯的一塊。它的結構和世界設定幾乎一模一樣 —— 一堆有型別的開關和數值,我們已經有 schema 驅動的編輯器可以直接套用。值得做的分組:

反外掛處置:偵測到作弊時警告 / 踢出 / 封鎖 / IP 封鎖(shouldWarnCheaters、shouldKickCheaters、shouldBanCheaters、shouldIPBanCheaters),以及是否附上原因
漏洞防護:重複登入防護(steamidProtection)、禁止捕捉塔主、非法道具防護、帕魯數值異常自動處置(palStatsMaxRank)、砍樹速率限制(treeLimiter,防火箭砍樹造成的大量卡頓)、PvP 傷害上限
聊天管理:禁字詞、禁用名稱、訊息長度上限、冷卻繞過
公告與日誌:上下線公告、處罰公告、死亡訊息,以及十幾個 log* 開關
MOTD:支援 {ServerName}、{ExpRate} 等十幾種變數的入場訊息
寫入時必須沿用我們處理 Engine.ini 的合併策略(保留未管理的鍵),因為 PalDefender 會隨版本新增設定。

2. 白名單與封鎖名單管理(WhiteList.json + Banlist.json)

這是我認為最該優先做的:它能和我們已經有的「歷史玩家」名冊直接扣起來。想像玩家分頁每一列旁邊多兩個按鈕:「加入白名單」「封鎖」,離線玩家也能操作(這正是我們上一輪解決的問題)。目前這些只能靠 RCON 指令一個一個打。官方文件明確建議開白名單,因為有已知漏洞。

第二梯隊:解鎖現在拿不到的資料
3. 串接 PalDefender 自己的 REST API(port 17993)

這個蠻大的。它提供遊戲內建 REST API 給不了的結構化資料:每位玩家的帕魯、道具、科技進度、公會清單、封鎖名單。有了它可以做出:

玩家詳情頁:他有哪些帕魯、背包內容、解鎖了哪些科技
公會瀏覽器
用 API 而非 RCON 來執行管理動作(更可靠、有結構化回應)
它用 Bearer token 且權限可細分,所以我們的 agent 可以拿一個受限 token。文件明確警告不要對外暴露這個埠 —— 剛好符合我們現有的模式:agent 打 localhost,瀏覽器只跟 agent 說話。需要順帶做 token 管理 UI(RESTAPI/Tokens/*.json)。

第三梯隊:給公開伺服器的進階功能
4. 帕魯匯入規則(Pals/ImportRules/*.json) — 對抗複製/改造帕魯:允許或封鎖特定帕魯 ID、限制等級、個體值、靈魂強化上限,還能針對單一帕魯做覆寫。開放式公開伺服器很需要,但需要一份帕魯 ID 清單(paldeck.cc 有)。

5. PalTemplate / PalSummon 編輯器 — 自訂帕魯、辦活動用的召喚。偏管理員玩具,優先度最低。

兩個我在讀文件時發現的、跨功能的重點
exitServerOnStartupFailure 和我們的崩潰自動重啟會打架。 這個設定的用意很好:PalDefender 起不來時直接關掉伺服器,避免存檔在沒有反外掛保護的情況下被玩。但它的實作是「以錯誤碼結束行程」,而文件自己也警告:某些主機商不看結束碼,會當成崩潰而無限重啟。我們的 supervisor 就正是這樣的東西。好消息是我們有每小時上限的護欄,但更好的做法是:偵測到日誌裡的 PalDefender 啟動失敗訊息時,直接停止並顯示原因,而不是盲目重啟。這個我建議一併修掉。

它的日誌可以取代我們的輪詢。 我們現在每 15 秒輪詢一次玩家列表來推算上下線。如果 logPlayerLogins 開著,PalDefender 會把精確的上下線事件寫進它自己的日誌 —— 而我們已經在 tail 那個檔案了。同理 logChat 能讓我們做出聊天記錄檢視器,logPlayerDeaths、logPlayerBuildings、logPlayerCaptures 則可以做成事件時間軸。這是把既有的兩個功能(日誌串流 + 上下線追蹤)接起來就能得到的東西。

我的建議順序是 2 → 1 → (修 exitServerOnStartupFailure 的衝突) → 3。第 2 項最有感、能立刻減少你打指令的次數;第 1 項工程量小但覆蓋面廣;第 3 項是最大的能力躍升,但要先確認你的 PalDefender 有裝起來、REST API 能開。

要我從哪一個開始?