<?php /** @var string $gateError */ ?><!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Inglês Passo a Passo</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦉</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css?v=3">
</head>
<body class="onboarding">
  <main class="container">
    <section class="welcome">
      <div class="mascot" aria-hidden="true">🦉</div>
      <h1>Inglês Passo a Passo</h1>
      <p class="lead">Este site é particular. Digite a senha para entrar.</p>
      <form method="post" class="card join">
        <label for="senha">Senha</label>
        <input id="senha" name="senha" type="password" autocomplete="current-password" required autofocus>
        <?php if ($gateError !== ''): ?><p class="form-error"><?= htmlspecialchars($gateError, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
        <button class="btn btn-primary btn-block" type="submit">Entrar</button>
      </form>
    </section>
  </main>
</body>
</html>
