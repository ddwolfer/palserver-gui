# palserver GUI 官網(靜態站)

單純的靜態網站,一個 `index.html` + `assets/` 圖片,可直接部署到 Zeabur、Vercel、Netlify、GitHub Pages 或任何靜態主機。

```
website/
├─ index.html      完整 HTML 文件(內含 CSS/JS,無需打包)
├─ assets/*.jpg    截圖
├─ zbpack.json     Zeabur 靜態設定
└─ README.md
```

## 部署到 Zeabur

1. 把這個 repo 推到 GitHub(或把 `website/` 這個資料夾單獨做成一個 repo)。
2. 到 [Zeabur](https://zeabur.com) → 建立 Project → **Deploy from GitHub** → 選這個 repo。
3. 若用整個 repo:在該服務的 **Settings → Root Directory** 填 `website`(因為站在子資料夾)。
   若 `website/` 已是獨立 repo 就不用設。
4. Zeabur 會偵測到 `index.html` + `zbpack.json`,以**靜態站**方式 serve,幾秒就好。
5. 到 **Domains** 綁自訂網域(例如 `palserver.iosoftware.ai`)或用 Zeabur 給的 `*.zeabur.app`。

> `zbpack.json` 的 `{"output_dir": "."}` 告訴 Zeabur 直接把這個資料夾當靜態輸出,不需要 build 步驟。

## 本機預覽

任何靜態伺服器都行,例如:

```sh
cd website
python3 -m http.server 8080      # 然後開 http://localhost:8080
```

## 更新內容

`index.html` 是自給自足的單檔(CSS/JS 都內嵌),直接改即可;截圖放 `assets/`。改完重新部署(Zeabur 連 GitHub 的話 push 就會自動重佈)。

深淺色會跟隨瀏覽器/系統設定(`prefers-color-scheme`),不需要額外設定。
