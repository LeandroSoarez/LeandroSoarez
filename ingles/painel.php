<?php
// Painel de acompanhamento: mostra o progresso de quem estuda no site.
// Acesso protegido pela senha da variável de ambiente ADMIN_PASSWORD.
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

const PANEL_COOKIE = 'painel';
const PANEL_DAYS = 30;

$secret = (string) getenv('ADMIN_PASSWORD');
$self = strtok($_SERVER['REQUEST_URI'] ?? '/painel', '?') ?: '/painel';

function h(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function panel_token(string $secret, int $expires): string
{
    return $expires . '.' . hash_hmac('sha256', "painel|$expires", $secret);
}

function panel_logged_in(string $secret): bool
{
    $cookie = $_COOKIE[PANEL_COOKIE] ?? '';
    $expires = (int) strtok($cookie, '.');
    return $secret !== '' && $expires > time() && hash_equals(panel_token($secret, $expires), $cookie);
}

function set_panel_cookie(string $value, int $expires): void
{
    $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    setcookie(PANEL_COOKIE, $value, [
        'expires' => $expires,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

/** Converte data UTC do banco para o horário de Brasília. */
function local_time(?string $utc): ?DateTimeImmutable
{
    if (!$utc) return null;
    return (new DateTimeImmutable(substr($utc, 0, 19), new DateTimeZone('UTC')))
        ->setTimezone(new DateTimeZone('America/Sao_Paulo'));
}

function relative_day(?DateTimeImmutable $date): string
{
    if (!$date) return 'nunca';
    $days = (int) (new DateTimeImmutable('today'))->diff($date->setTime(0, 0))->format('%r%a');
    return match (true) {
        $days === 0 => 'hoje às ' . $date->format('H:i'),
        $days === -1 => 'ontem às ' . $date->format('H:i'),
        default => 'há ' . abs($days) . ' dias (' . $date->format('d/m') . ')',
    };
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['acao'] ?? '';
    if ($action === 'entrar') {
        if ($secret !== '' && hash_equals($secret, (string) ($_POST['senha'] ?? ''))) {
            $expires = time() + PANEL_DAYS * 86400;
            set_panel_cookie(panel_token($secret, $expires), $expires);
            header('Location: ' . $self, true, 303);
            exit;
        }
        sleep(1); // atrasa tentativas de adivinhar a senha
        $error = 'Senha incorreta.';
    } elseif ($action === 'sair') {
        set_panel_cookie('', time() - 3600);
        header('Location: ' . $self, true, 303);
        exit;
    } elseif ($action === 'excluir' && panel_logged_in($secret)) {
        db()->prepare('DELETE FROM users WHERE id = ?')->execute([(int) ($_POST['usuario'] ?? 0)]);
        header('Location: ' . $self, true, 303);
        exit;
    }
}

$logged = panel_logged_in($secret);
$levels = levels();
$lessons = lessons_by_id();
$catalog = achievement_catalog();

if ($logged) {
    $pdo = db();
    $users = $pdo->query('SELECT * FROM users ORDER BY xp DESC, id ASC')->fetchAll();
    $selectedId = (int) ($_GET['u'] ?? ($users[0]['id'] ?? 0));
    $user = null;
    foreach ($users as $u) {
        if ((int) $u['id'] === $selectedId) $user = $u;
    }
    $user ??= $users[0] ?? null;

    if ($user) {
        $uid = (int) $user['id'];
        $stmt = $pdo->prepare('SELECT lesson_id, best_score, total, attempts, updated_at FROM progress WHERE user_id = ?');
        $stmt->execute([$uid]);
        $progress = [];
        foreach ($stmt as $row) $progress[$row['lesson_id']] = $row;

        $stmt = $pdo->prepare('SELECT code, earned_at FROM achievements WHERE user_id = ? ORDER BY earned_at');
        $stmt->execute([$uid]);
        $earned = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT lesson_id, score, total, xp, created_at FROM attempts WHERE user_id = ? ORDER BY created_at DESC');
        $stmt->execute([$uid]);
        $history = $stmt->fetchAll();

        $passed = array_filter($progress, fn($p) => $p['best_score'] / $p['total'] >= PASS_RATIO);
        $answered = array_sum(array_column($history, 'total'));
        $correct = array_sum(array_column($history, 'score'));
        $accuracy = $answered ? (int) round($correct / $answered * 100) : null;

        // Atividade por dia (horário de Brasília) para o calendário das últimas 5 semanas.
        $perDay = [];
        foreach ($history as $a) {
            $day = local_time($a['created_at'])->format('Y-m-d');
            $perDay[$day] = ($perDay[$day] ?? 0) + 1;
        }
        $today = new DateTimeImmutable('today');
        $start = $today->modify('-34 days');
        $start = $start->modify('-' . ((int) $start->format('N') % 7) . ' days'); // começa no domingo

        // Próxima lição: primeira ainda não concluída, na ordem da trilha.
        $next = null;
        foreach ($levels as $level) {
            foreach ($level['lessons'] as $lesson) {
                if (!isset($passed[$lesson['id']])) { $next = [$level, $lesson]; break 2; }
            }
        }
        $lastActivity = local_time($history[0]['created_at'] ?? null);
        $streak = (int) $user['streak'];
        if ($user['last_day'] !== null && $user['last_day'] < date('Y-m-d', strtotime('-1 day'))) $streak = 0;
    }
}
?><!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Painel de progresso</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css?v=3">
  <link rel="stylesheet" href="/css/painel.css?v=1">
</head>
<body class="panel-page">
  <header class="topbar">
    <span class="brand"><span class="brand-logo">📊</span><span class="brand-name">Painel de <b>progresso</b></span></span>
    <?php if ($logged): ?>
      <form method="post"><input type="hidden" name="acao" value="sair"><button class="btn btn-ghost btn-small" type="submit">Sair</button></form>
    <?php endif; ?>
  </header>

  <main class="container panel">
  <?php if ($secret === ''): ?>
    <section class="card panel-login">
      <h1>Painel desativado</h1>
      <p class="lead">Defina a variável de ambiente <code>ADMIN_PASSWORD</code> no servidor para ativar o painel.</p>
    </section>

  <?php elseif (!$logged): ?>
    <form method="post" class="card panel-login">
      <div class="mascot" aria-hidden="true">🔒</div>
      <h1>Painel de progresso</h1>
      <p class="lead">Área restrita. Digite a senha para ver o progresso.</p>
      <input type="hidden" name="acao" value="entrar">
      <label for="senha">Senha</label>
      <input id="senha" name="senha" type="password" autocomplete="current-password" required autofocus>
      <?php if ($error): ?><p class="form-error"><?= h($error) ?></p><?php endif; ?>
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>
    </form>

  <?php elseif (!$user): ?>
    <section class="card panel-login">
      <div class="mascot" aria-hidden="true">🦉</div>
      <h1>Ninguém começou ainda</h1>
      <p class="lead">Assim que alguém criar uma conta no site, o progresso aparece aqui.</p>
    </section>

  <?php else: ?>
    <?php if (count($users) > 1): ?>
      <nav class="who" aria-label="Escolher aluno">
        <?php foreach ($users as $u): ?>
          <a href="?u=<?= (int) $u['id'] ?>" class="<?= (int) $u['id'] === $uid ? 'active' : '' ?>"><?= h($u['name']) ?> <small><?= (int) $u['xp'] ?> XP</small></a>
        <?php endforeach; ?>
      </nav>
    <?php endif; ?>

    <section class="card student">
      <div class="avatar big"><?= h(mb_strtoupper(mb_substr($user['name'], 0, 1))) ?></div>
      <div class="student-text">
        <h1><?= h($user['name']) ?></h1>
        <p>Estuda desde <?= h(local_time($user['created_at'])?->format('d/m/Y') ?? '—') ?> · última atividade <b><?= h(relative_day($lastActivity)) ?></b></p>
        <?php if ($next): ?>
          <p class="next" style="--c:<?= h($next[0]['color']) ?>">Próxima lição: <b><?= h($next[1]['icon'] . ' ' . $next[1]['title']) ?></b> <span class="chip">Nível <?= h($next[0]['code']) ?></span></p>
        <?php else: ?>
          <p class="next">🎓 Concluiu o curso inteiro!</p>
        <?php endif; ?>
      </div>
    </section>

    <section class="tiles" aria-label="Resumo">
      <div class="stat-tile"><span class="stat-label">Lições concluídas</span><b class="stat-value"><?= count($passed) ?><small> de <?= count($lessons) ?></small></b>
        <div class="meter" role="img" aria-label="<?= round(count($passed) / count($lessons) * 100) ?>% do curso"><span style="width:<?= count($passed) / count($lessons) * 100 ?>%"></span></div></div>
      <div class="stat-tile"><span class="stat-label">XP total</span><b class="stat-value"><?= number_format((int) $user['xp'], 0, ',', '.') ?></b></div>
      <div class="stat-tile"><span class="stat-label">Sequência atual</span><b class="stat-value"><?= $streak ?> <small><?= $streak === 1 ? 'dia' : 'dias' ?></small></b><span class="stat-note">melhor: <?= (int) $user['best_streak'] ?></span></div>
      <div class="stat-tile"><span class="stat-label">Acertos nos exercícios</span><b class="stat-value"><?= $accuracy === null ? '—' : $accuracy . '%' ?></b><span class="stat-note"><?= $correct ?> de <?= $answered ?></span></div>
    </section>

    <section class="card">
      <h2 class="section-title">📅 Dias de estudo <small>últimas 5 semanas</small></h2>
      <div class="calendar" role="img" aria-label="Calendário de dias com lições feitas">
        <?php foreach (['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as $wd): ?><span class="cal-head"><?= $wd ?></span><?php endforeach; ?>
        <?php for ($d = $start; $d <= $today; $d = $d->modify('+1 day')):
            $count = $perDay[$d->format('Y-m-d')] ?? 0;
            $step = min($count, 3);
            $label = $d->format('d/m') . ': ' . ($count ? "$count " . ($count === 1 ? 'lição' : 'lições') : 'sem estudo'); ?>
          <span class="cal-day s<?= $step ?><?= $d == $today ? ' today' : '' ?>" title="<?= h($label) ?>" aria-label="<?= h($label) ?>"></span>
        <?php endfor; ?>
      </div>
      <div class="cal-legend"><span>menos</span><i class="cal-day s0"></i><i class="cal-day s1"></i><i class="cal-day s2"></i><i class="cal-day s3"></i><span>mais lições no dia</span></div>
    </section>

    <section>
      <h2 class="section-title">🗺️ Progresso por nível</h2>
      <div class="levels">
        <?php foreach ($levels as $level):
            $done = count(array_filter($level['lessons'], fn($l) => isset($passed[$l['id']])));
            $total = count($level['lessons']); ?>
          <div class="level-row" style="--c:<?= h($level['color']) ?>">
            <div class="level-name"><span class="level-code"><?= h($level['code']) ?></span><?= h($level['name']) ?></div>
            <div class="lesson-dots">
              <?php foreach ($level['lessons'] as $lesson):
                  $p = $progress[$lesson['id']] ?? null;
                  $state = !$p ? 'todo' : (isset($passed[$lesson['id']]) ? 'done' : 'trying');
                  $tip = $lesson['title'] . ($p ? " — melhor nota {$p['best_score']}/{$p['total']}, {$p['attempts']} tentativa(s)" : ' — ainda não feita'); ?>
                <span class="dot <?= $state ?>" title="<?= h($tip) ?>"><?= $state === 'done' ? '✓' : ($state === 'trying' ? '…' : '') ?><span class="sr-only"><?= h($tip) ?></span></span>
              <?php endforeach; ?>
            </div>
            <span class="level-count"><?= $done ?>/<?= $total ?></span>
          </div>
        <?php endforeach; ?>
      </div>
      <p class="dot-legend"><span class="dot done">✓</span> concluída <span class="dot trying">…</span> tentou, ainda não passou <span class="dot todo"></span> não feita</p>
    </section>

    <section class="card">
      <h2 class="section-title">🕒 Atividade recente</h2>
      <?php if (!$history): ?>
        <p class="hint">Nenhuma lição feita ainda.</p>
      <?php else: ?>
        <div class="table-wrap">
          <table class="activity">
            <thead><tr><th>Quando</th><th>Lição</th><th>Acertos</th><th>XP</th></tr></thead>
            <tbody>
            <?php foreach (array_slice($history, 0, 40) as $a):
                $info = $lessons[$a['lesson_id']] ?? null;
                $ok = $a['score'] / $a['total'] >= PASS_RATIO; ?>
              <tr>
                <td><?= h(local_time($a['created_at'])->format('d/m H:i')) ?></td>
                <td><?= $info ? h($info['lesson']['icon'] . ' ' . $info['lesson']['title']) . ' <small>' . h($info['level']['code']) . '</small>' : h($a['lesson_id']) ?></td>
                <td><span class="result <?= $ok ? 'ok' : 'no' ?>"><?= $ok ? '✓' : '✗' ?> <?= (int) $a['score'] ?>/<?= (int) $a['total'] ?></span></td>
                <td>+<?= (int) $a['xp'] ?></td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endif; ?>
    </section>

    <section class="card">
      <h2 class="section-title">🏅 Conquistas <small><?= count($earned) ?> de <?= count($catalog) ?></small></h2>
      <?php if (!$earned): ?>
        <p class="hint">Nenhuma conquista ainda.</p>
      <?php else: ?>
        <ul class="badges">
          <?php foreach ($earned as $e): if (!isset($catalog[$e['code']])) continue; [$icon, $title] = $catalog[$e['code']]; ?>
            <li><span><?= $icon ?></span><b><?= h($title) ?></b><small><?= h(local_time($e['earned_at'])?->format('d/m/Y') ?? '') ?></small></li>
          <?php endforeach; ?>
        </ul>
      <?php endif; ?>
    </section>

    <details class="card danger-zone">
      <summary>⚙️ Gerenciar contas</summary>
      <p class="hint">Exclui uma conta e todo o progresso dela. Não dá para desfazer.</p>
      <?php foreach ($users as $u): ?>
        <form method="post" class="account-row" onsubmit="return confirm('Excluir a conta de <?= h(addslashes($u['name'])) ?> e todo o progresso?')">
          <input type="hidden" name="acao" value="excluir">
          <input type="hidden" name="usuario" value="<?= (int) $u['id'] ?>">
          <span><?= h($u['name']) ?> <small><?= (int) $u['xp'] ?> XP · desde <?= h(local_time($u['created_at'])?->format('d/m/Y') ?? '—') ?></small></span>
          <button class="btn btn-ghost btn-small" type="submit">Excluir</button>
        </form>
      <?php endforeach; ?>
    </details>
  <?php endif; ?>
  </main>
</body>
</html>
