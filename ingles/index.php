<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

$levels = levels();
$lessonCount = array_sum(array_map(fn($l) => count($l['lessons']), $levels));
$config = [
    'levels' => $levels,
    'passRatio' => PASS_RATIO,
    'extraExercises' => EXTRA_EXERCISES,
    'achievements' => achievement_catalog(),
];
?><!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Inglês Passo a Passo</title>
  <meta name="description" content="Aprenda inglês nível por nível, do A1 ao C2: <?= $lessonCount ?> lições com explicação em português, áudio, exercícios interativos, XP e ranking.">
  <meta name="theme-color" content="#3b82f6">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦉</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css?v=2">
</head>
<body>
  <header class="topbar">
    <a href="#/" class="brand"><span class="brand-logo">🦉</span><span class="brand-name">Inglês <b>Passo a Passo</b></span></a>
    <nav class="stats" id="stats" aria-label="Seu progresso"></nav>
  </header>

  <main id="app" class="container" tabindex="-1"></main>

  <nav class="bottom-nav" aria-label="Navegação principal">
    <a href="#/" data-nav="home"><span>🗺️</span>Trilha</a>
    <a href="#/conquistas" data-nav="conquistas"><span>🏅</span>Conquistas</a>
    <a href="#/ranking" data-nav="ranking"><span>🏆</span>Ranking</a>
    <a href="#/perfil" data-nav="perfil"><span>👤</span>Perfil</a>
  </nav>

  <div id="toasts" class="toasts" aria-live="polite"></div>
  <canvas id="confetti" aria-hidden="true"></canvas>

  <script>window.COURSE = <?= json_encode($config, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
  <script src="js/app.js?v=2"></script>
</body>
</html>
