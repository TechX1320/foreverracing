<?php
$config = require __DIR__ . '/app/config/app.php';
$build = htmlspecialchars((string)$config['build'], ENT_QUOTES, 'UTF-8');
$storageMode = defined('FR_STATIC_BUILD') && FR_STATIC_BUILD ? 'local' : 'api';
$statusText = $storageMode === 'local' ? 'LOCAL DEV' : 'SERVER';
$storageText = $storageMode === 'local' ? 'BROWSER LOCAL' : 'PHP / JSON';
?>
<!doctype html>
<html lang="en" data-storage-mode="<?= $storageMode ?>" data-build="<?= $build ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#111315">
  <meta name="color-scheme" content="dark">
  <meta name="description" content="Forever Racing - a browser-based garage and drag racing game.">
  <title>Forever Racing</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="assets/css/app.css?v=<?= $build ?>">
</head>
<body>
  <div id="bootScreen" class="boot-screen">
    <div class="boot-mark">FR</div>
    <div><strong>FOREVER RACING</strong><span>Loading garage data...</span></div>
  </div>

  <div id="appRoot" hidden>
    <div class="game-frame">
      <header class="game-header">
        <button class="brand" type="button" data-nav="home" aria-label="Forever Racing home">
          <span class="brand__mark">FR</span>
          <span class="brand__copy"><strong>FOREVER RACING</strong><small>BUILD <?= $build ?></small></span>
        </button>
        <div class="game-header__meta">
          <span class="environment-tag"><?= htmlspecialchars($statusText, ENT_QUOTES, 'UTF-8') ?></span>
          <span class="storage-tag"><?= htmlspecialchars($storageText, ENT_QUOTES, 'UTF-8') ?></span>
          <button class="header-action" id="logoutButton" type="button">SIGN OUT</button>
        </div>
      </header>

      <section class="status-strip" aria-label="Player status">
        <div><span>PLAYER</span><b id="playerName">Admin</b></div>
        <div><span>CREDITS</span><b id="statCredits">0</b></div>
        <div><span>LEVEL</span><b id="statLevel">1</b></div>
        <div><span>REP</span><b id="statRep">0</b></div>
        <div class="status-strip__car"><span>CURRENT CAR</span><b id="currentCarName">None</b></div>
        <div><span>STAGE</span><b id="currentStage">-</b></div>
        <div><span>HP</span><b id="statusHp">-</b></div>
        <div><span>WEIGHT</span><b id="statusWeight">-</b></div>
      </section>

      <div class="game-layout">
        <nav class="nav-rail" aria-label="Game navigation">
          <div class="nav-rail__label">MAIN</div>
          <button type="button" data-nav="home"><b>HOME</b><span>Overview</span></button>
          <button type="button" data-nav="garage"><b>GARAGE</b><span>Your cars</span></button>
          <button type="button" data-nav="showroom"><b>SHOWROOM</b><span>Buy new</span></button>
          <button type="button" data-nav="parts"><b>PARTS</b><span>Build car</span></button>
          <button type="button" data-nav="quick-race"><b>QUICK RACE</b><span>Run car</span></button>
          <button type="button" data-nav="usedlot"><b>USED LOT</b><span>Rotating stock</span></button>
          <button type="button" data-nav="roguelike"><b>ROGUELIKE</b><span>PvE run</span></button>
          <button type="button" data-nav="events"><b>EVENTS</b><span>Coming online</span></button>
          <button type="button" data-nav="teams"><b>TEAMS</b><span>Social</span></button>
          <button type="button" data-nav="leaderboards"><b>RECORDS</b><span>Stats</span></button>
          <button type="button" data-nav="multiplayer"><b>MULTIPLAYER</b><span>PvP</span></button>
          <div class="nav-rail__label nav-rail__label--secondary">SYSTEM</div>
          <button type="button" data-nav="settings"><b>SETTINGS</b><span>Local UI</span></button>
        </nav>

        <main class="game-content">
          <section id="homeDashboard" class="home-dashboard">
            <section class="current-build-panel">
              <header class="panel-heading">
                <div><span>CURRENT BUILD</span><h1 id="homeCarName">No current car</h1><p id="homeCarFactory">Visit the Showroom to start a build.</p></div>
                <div id="homeBuildSummary" class="build-summary"><b>BUILD STAGE -</b><span>No active build.</span></div>
              </header>
              <div id="homeVehicleVisual" class="home-vehicle-visual"><div class="no-car-visual">NO CURRENT CAR</div></div>
              <div id="homeCarStats" class="home-car-stats">
                <span><b>-</b> HP</span><span><b>-</b> LB-FT</span><span><b>-</b> LB</span><span><b>-</b> DRIVE</span>
              </div>
              <div class="home-car-actions">
                <button class="button button--primary button--small" data-nav="garage">MANAGE CAR</button>
                <button class="button button--small" data-nav="parts">UPGRADES</button>
                <button class="button button--small" data-nav="quick-race">RACE</button>
              </div>
            </section>

            <section class="home-secondary-grid">
              <section class="home-section">
                <header><span>RECENT ACTIVITY</span><button type="button" data-nav="garage">GARAGE</button></header>
                <div id="homeActivity" class="activity-list"><div><span>No activity yet.</span><b>-</b></div></div>
              </section>
              <section class="home-section">
                <header><span>BUILD STAGES</span><button type="button" data-nav="parts">PARTS</button></header>
                <div class="stage-mini-list">
                  <div><b>S1</b><span>Street / stock chassis</span></div>
                  <div><b>S2</b><span>Street race / gutted + caged</span></div>
                  <div><b>S3</b><span>Front-half / engine swaps</span></div>
                  <div><b>S4</b><span>Full race car</span></div>
                </div>
              </section>
            </section>
          </section>

          <section id="screenRoot" class="screen-root" aria-live="polite"></section>
        </main>

        <aside class="context-rail">
          <section class="rail-panel">
            <header>OBJECTIVE</header>
            <div id="tutorialRail" class="tutorial-rail"><span class="rail-state">FTUE</span><strong>Loading...</strong></div>
          </section>
          <section class="rail-panel">
            <header>BUILD RULES</header>
            <div class="rule-list">
              <div><b>STAGE</b><span>Cars only move forward.</span></div>
              <div><b>PARTS</b><span>Stats are shown before purchase.</span></div>
              <div><b>SWAPS</b><span>Physical compatibility matters.</span></div>
              <div><b>DATA</b><span>Local dev save stays in this browser.</span></div>
            </div>
          </section>
          <section class="rail-panel rail-panel--dev">
            <header>DEVELOPMENT</header>
            <p>GitHub Pages is for UI, gameplay and systems testing. Shared accounts arrive with the hosted server build.</p>
          </section>
        </aside>
      </div>

      <footer class="game-footer"><span>FOREVER RACING / SYSTEMS-FIRST DEVELOPMENT</span><span>MOBILE / FOLDABLE / DESKTOP</span></footer>
    </div>
  </div>

  <div id="dialogRoot"></div>
  <div id="toastRoot" class="toast-root" aria-live="polite" aria-atomic="true"></div>
  <noscript><div class="noscript">Forever Racing requires JavaScript.</div></noscript>
  <script type="module" src="assets/js/app.js?v=<?= $build ?>"></script>
</body>
</html>
