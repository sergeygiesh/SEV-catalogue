# Best JDM — автономный каталог разрешённых моделей (ROVER)

Этот репозиторий сам, в облаке GitHub, два раза в неделю:
1. заходит на портал ROVER (headless-браузер Playwright) и собирает действующие
   одобрения **Specialist & Enthusiast Vehicles / In Force**;
2. пересобирает страницу поиска `index.html` (фильтры Make / Model / Build date /
   Search; в карточке — Model code / Variant / Expiry);
3. публикует её на **GitHub Pages**.

Сайт Best JDM (Wix) показывает эту страницу через iframe в разделе **Import to Order**.
После настройки всё работает без твоего компьютера и без Cowork.

## Файлы
- `scrape.mjs` — скрейпер ROVER на Playwright → `payload.json`
- `build_groups.py` — `payload.json` → `groups.json` (группировка, отсев просроченных)
- `build_html.py` — `groups.json` → `index.html` (панель поиска)
- `.github/workflows/update.yml` — расписание и весь конвейер (scrape → build → deploy)
- `package.json`, `.gitignore`

---

## Разовая настройка (≈10 минут)

### 1. Создать репозиторий и загрузить файлы
- Зайти на github.com (лучше отдельный технический аккаунт), **New repository** →
  имя, например `bestjdm-catalogue`. Можно Private.
- Загрузить **всё содержимое** этой папки (`scrape.mjs`, `build_groups.py`,
  `build_html.py`, `package.json`, `.gitignore` и папку `.github/`).
  Способ A: `git clone` → скопировать файлы → `git add . && git commit && git push`.
  Способ B: на странице репо **Add file → Upload files**, перетащить файлы.
  Важно: папка `.github/workflows/` с `update.yml` обязательно должна попасть в репо.

### 2. Включить GitHub Pages
- **Settings → Pages → Build and deployment → Source: GitHub Actions.**
  (Не «Deploy from a branch», а именно «GitHub Actions».)

### 3. Первый запуск (он же тест скрейпа)
- Вкладка **Actions** → workflow **Update ROVER catalogue** → **Run workflow**.
- Дождаться зелёной галочки (≈5–10 мин: ставится Chromium, идёт скрейп, сборка, деплой).
- Логи шага *Scrape ROVER* показывают счётчики (block B/C/D) — там видно, сколько
  записей собрано.
- После успешного деплоя адрес страницы появится в **Settings → Pages**
  (вид `https://<логин>.github.io/bestjdm-catalogue/`). Открой — должны быть фильтры.

### 4. Встроить в сайт (раздел Import to Order)
- В редакторе Wix открыть/создать страницу с адресом `/import-to-order`
  (сейчас пункт меню ведёт на главную — назначь ему эту страницу).
- `+ Add → Embed Code → Embed a Site` (или Embed → HTML iframe).
- Вставить адрес страницы из шага 3 (обязательно **https://**).
- Растянуть рамку по ширине контента, высота ~700–800px.
- **Publish.** Для посетителя фильтры будут прямо на странице, адрес в браузере —
  `bestjdm.com.au/import-to-order`. Внешний github.io-адрес посетитель не видит.

Готово. Дальше каталог обновляется сам.

---

## Расписание
В `update.yml`: `cron: '30 19 * * 1,4'` — **по UTC**, понедельник и четверг
(≈ раннее утро вторника/пятницы по Сиднею). Поменять время/дни можно прямо в этой строке.
Также всегда доступен ручной запуск (Actions → Run workflow).

## Защита от «пустой» публикации
Если скрейп вернул аномально мало записей (сбой/блокировка), `scrape.mjs` падает с ошибкой,
workflow завершается красным и **старая опубликованная версия остаётся на месте** —
на сайте не появится пустой каталог.

## Если ROVER заблокирует IP GitHub (анти-бот)
Дата-центровые IP иногда режут. Если на первом запуске шаг *Scrape ROVER* падает на
block A/B (не находит фильтры или грид), варианты по возрастанию усилий:
1. Прокси: добавить в `chromium.launch({ proxy: { server, username, password } })`
   (резиденшел-прокси) и положить креды в Secrets репозитория.
2. Хостинг-браузер (Browserless/ScrapingBee) вместо локального Chromium.
3. Перенести запуск на маленький VPS со стабильным «чистым» IP.
Логика скрейпа при этом не меняется — меняется только способ запуска браузера.

## Фирменный поддомен (опционально, позже)
Чтобы «начинка» жила на `catalogue.bestjdm.com.au`:
- Settings → Pages → **Custom domain** → `catalogue.bestjdm.com.au`.
- В DNS домена (если домен на Wix — в Wix → Domains → DNS) добавить запись
  **CNAME `catalogue` → `<логин>.github.io`**.
- В iframe на сайте поменять адрес на `https://catalogue.bestjdm.com.au`.
Адрес страницы для посетителя (`bestjdm.com.au/import-to-order`) при этом не меняется.

## Локальная проверка сборки (необязательно)
Имея `payload.json`, можно собрать страницу локально без скрейпа:
```
python build_groups.py && python build_html.py   # создаст index.html
```
