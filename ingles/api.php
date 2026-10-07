<?php
// API JSON: contas, progresso, XP, sequência de dias, conquistas e ranking.
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/gate.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function input(): array
{
    $body = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($body) ? $body : [];
}

function current_user(): array
{
    $token = $_SERVER['HTTP_X_TOKEN'] ?? '';
    if (!preg_match('/^[a-f0-9]{32}$/', $token)) {
        respond(['error' => 'Sessão inválida.'], 401);
    }
    $stmt = db()->prepare('SELECT * FROM users WHERE token = ?');
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user) {
        respond(['error' => 'Usuário não encontrado.'], 401);
    }
    return $user;
}

function public_user(array $user): array
{
    // Sequência expira se o último estudo foi antes de ontem.
    $streak = (int) $user['streak'];
    if ($user['last_day'] !== null && $user['last_day'] < date('Y-m-d', strtotime('-1 day'))) {
        $streak = 0;
    }
    return [
        'name' => $user['name'],
        'xp' => (int) $user['xp'],
        'streak' => $streak,
        'bestStreak' => (int) $user['best_streak'],
        'studiedToday' => $user['last_day'] === date('Y-m-d'),
        'lastDay' => $user['last_day'],
    ];
}

function user_state(array $user): array
{
    $stmt = db()->prepare('SELECT lesson_id, best_score, total FROM progress WHERE user_id = ?');
    $stmt->execute([$user['id']]);
    $progress = [];
    foreach ($stmt as $row) {
        $progress[$row['lesson_id']] = ['best' => (int) $row['best_score'], 'total' => (int) $row['total']];
    }
    $stmt = db()->prepare('SELECT code FROM achievements WHERE user_id = ? ORDER BY earned_at');
    $stmt->execute([$user['id']]);
    return [
        'user' => public_user($user),
        'progress' => $progress ?: new stdClass(),
        'achievements' => $stmt->fetchAll(PDO::FETCH_COLUMN),
    ];
}

function award(array $user, string $code): bool
{
    $stmt = db()->prepare('INSERT INTO achievements (user_id, code) VALUES (?, ?) ON CONFLICT DO NOTHING');
    $stmt->execute([$user['id'], $code]);
    return $stmt->rowCount() > 0;
}

if (!site_unlocked()) {
    respond(['error' => 'Site protegido por senha.'], 403);
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'register': {
            if ($method !== 'POST') respond(['error' => 'Use POST.'], 405);
            $name = trim(preg_replace('/\s+/u', ' ', (string) (input()['name'] ?? '')));
            $len = mb_strlen($name);
            if ($len < 2 || $len > 24) {
                respond(['error' => 'O nome deve ter entre 2 e 24 caracteres.'], 422);
            }
            $token = bin2hex(random_bytes(16));
            db()->prepare('INSERT INTO users (name, token) VALUES (?, ?)')->execute([$name, $token]);
            $stmt = db()->prepare('SELECT * FROM users WHERE token = ?');
            $stmt->execute([$token]);
            respond(['token' => $token] + user_state($stmt->fetch()));
        }

        case 'me':
            respond(user_state(current_user()));

        case 'complete': {
            if ($method !== 'POST') respond(['error' => 'Use POST.'], 405);
            $user = current_user();
            $data = input();
            $lessons = lessons_by_id();
            $lessonId = (string) ($data['lessonId'] ?? '');
            if (!isset($lessons[$lessonId])) {
                respond(['error' => 'Lição desconhecida.'], 404);
            }
            $lesson = $lessons[$lessonId]['lesson'];
            $level = $lessons[$lessonId]['level'];
            $total = lesson_total($lesson);
            $score = max(0, min($total, (int) ($data['score'] ?? 0)));
            $passed = $score / $total >= PASS_RATIO;

            $pdo = db();
            $pdo->beginTransaction();

            $stmt = $pdo->prepare('SELECT best_score FROM progress WHERE user_id = ? AND lesson_id = ?');
            $stmt->execute([$user['id'], $lessonId]);
            $previous = $stmt->fetchColumn();
            $wasPassed = $previous !== false && $previous / $total >= PASS_RATIO;

            // XP: 10 por acerto, +20 se perfeito, +50 na primeira vez que conclui.
            $xp = $score * 10 + ($score === $total ? 20 : 0) + ($passed && !$wasPassed ? 50 : 0);

            $today = date('Y-m-d');
            $streak = (int) $user['streak'];
            if ($user['last_day'] !== $today) {
                $streak = $user['last_day'] === date('Y-m-d', strtotime('-1 day')) ? $streak + 1 : 1;
            }
            $pdo->prepare('UPDATE users SET xp = xp + ?, streak = ?, best_streak = ?, last_day = ? WHERE id = ?')
                ->execute([$xp, $streak, max((int) $user['best_streak'], $streak), $today, $user['id']]);

            $pdo->prepare('INSERT INTO progress (user_id, lesson_id, best_score, total) VALUES (?, ?, ?, ?)
                ON CONFLICT (user_id, lesson_id) DO UPDATE SET
                best_score = CASE WHEN excluded.best_score > progress.best_score THEN excluded.best_score ELSE progress.best_score END,
                total = excluded.total, attempts = progress.attempts + 1, updated_at = CURRENT_TIMESTAMP')
                ->execute([$user['id'], $lessonId, $score, $total]);

            $pdo->prepare('INSERT INTO attempts (user_id, lesson_id, score, total, xp, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$user['id'], $lessonId, $score, $total, $xp, gmdate('Y-m-d H:i:s')]);

            $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
            $stmt->execute([$user['id']]);
            $user = $stmt->fetch();
            $state = user_state($user);

            $new = [];
            $passedIds = array_keys(array_filter($state['progress'], fn($p) => $p['best'] / $p['total'] >= PASS_RATIO));
            if ($passed && award($user, 'first_lesson')) $new[] = 'first_lesson';
            if ($score === $total && award($user, 'perfect')) $new[] = 'perfect';
            if ($streak >= 3 && award($user, 'streak_3')) $new[] = 'streak_3';
            if ($streak >= 7 && award($user, 'streak_7')) $new[] = 'streak_7';
            if ($user['xp'] >= 500 && award($user, 'xp_500')) $new[] = 'xp_500';
            if ($user['xp'] >= 2000 && award($user, 'xp_2000')) $new[] = 'xp_2000';
            $levelIds = array_column($level['lessons'], 'id');
            if (!array_diff($levelIds, $passedIds) && award($user, 'level_' . $level['id'])) {
                $new[] = 'level_' . $level['id'];
            }
            $pdo->commit();

            $state['achievements'] = array_values(array_unique([...$state['achievements'], ...$new]));
            respond($state + ['result' => ['score' => $score, 'total' => $total, 'passed' => $passed, 'xp' => $xp, 'newAchievements' => $new]]);
        }

        case 'restore': {
            // Recria uma conta a partir da cópia guardada no navegador, quando o banco do
            // servidor foi apagado (hospedagens com disco temporário).
            if ($method !== 'POST') respond(['error' => 'Use POST.'], 405);
            $token = $_SERVER['HTTP_X_TOKEN'] ?? '';
            if (!preg_match('/^[a-f0-9]{32}$/', $token)) respond(['error' => 'Sessão inválida.'], 401);
            $stmt = db()->prepare('SELECT * FROM users WHERE token = ?');
            $stmt->execute([$token]);
            if ($existing = $stmt->fetch()) respond(user_state($existing));

            $backup = input()['backup'] ?? null;
            $u = is_array($backup) ? ($backup['user'] ?? null) : null;
            $name = is_array($u) ? trim(preg_replace('/\s+/u', ' ', (string) ($u['name'] ?? ''))) : '';
            if (mb_strlen($name) < 2 || mb_strlen($name) > 24) respond(['error' => 'Cópia inválida.'], 422);
            $lastDay = is_string($u['lastDay'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $u['lastDay']) ? $u['lastDay'] : null;
            $streak = max(0, min(3650, (int) ($u['streak'] ?? 0)));
            $bestStreak = max($streak, min(3650, (int) ($u['bestStreak'] ?? 0)));

            $lessons = lessons_by_id();
            $progress = [];
            $maxXp = 0;
            foreach ((array) ($backup['progress'] ?? []) as $id => $p) {
                if (!isset($lessons[$id]) || !is_array($p)) continue;
                $total = lesson_total($lessons[$id]['lesson']);
                $progress[$id] = [max(0, min($total, (int) ($p['best'] ?? 0))), $total];
            }
            // O XP não pode passar do que é possível ganhar repetindo as lições salvas.
            foreach ($progress as [$best, $total]) $maxXp += ($total * 10 + 70) * 50;
            $xp = max(0, min($maxXp, (int) ($u['xp'] ?? 0)));
            $catalog = achievement_catalog();
            $codes = array_values(array_filter((array) ($backup['achievements'] ?? []), fn($c) => is_string($c) && isset($catalog[$c])));

            $pdo = db();
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('INSERT INTO users (name, token, xp, streak, best_streak, last_day) VALUES (?, ?, ?, ?, ?, ?) RETURNING id');
            $stmt->execute([$name, $token, $xp, $streak, $bestStreak, $lastDay]);
            $id = (int) $stmt->fetchColumn();
            $ins = $pdo->prepare('INSERT INTO progress (user_id, lesson_id, best_score, total) VALUES (?, ?, ?, ?)');
            foreach ($progress as $lessonId => [$best, $total]) $ins->execute([$id, $lessonId, $best, $total]);
            $ins = $pdo->prepare('INSERT INTO achievements (user_id, code) VALUES (?, ?) ON CONFLICT DO NOTHING');
            foreach ($codes as $code) $ins->execute([$id, $code]);
            $pdo->commit();

            $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
            $stmt->execute([$id]);
            respond(user_state($stmt->fetch()));
        }

        case 'health':
            // Diz qual banco está em uso (útil para conferir a hospedagem).
            db()->query('SELECT 1');
            respond(['ok' => true, 'database' => db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql' ? 'postgres' : 'sqlite']);

        case 'ranking': {
            $rows = db()->query('SELECT token, name, xp, streak, last_day FROM users WHERE xp > 0 ORDER BY xp DESC, id ASC LIMIT 20')->fetchAll();
            $yesterday = date('Y-m-d', strtotime('-1 day'));
            $token = $_SERVER['HTTP_X_TOKEN'] ?? '';
            respond(['ranking' => array_map(fn($r) => [
                'name' => $r['name'],
                'xp' => (int) $r['xp'],
                'streak' => $r['last_day'] >= $yesterday ? (int) $r['streak'] : 0,
                'me' => $token !== '' && hash_equals($r['token'], $token),
            ], $rows)]);
        }

        case 'reset': {
            if ($method !== 'POST') respond(['error' => 'Use POST.'], 405);
            $user = current_user();
            $pdo = db();
            $pdo->prepare('DELETE FROM progress WHERE user_id = ?')->execute([$user['id']]);
            $pdo->prepare('DELETE FROM achievements WHERE user_id = ?')->execute([$user['id']]);
            $pdo->prepare('DELETE FROM attempts WHERE user_id = ?')->execute([$user['id']]);
            $pdo->prepare('UPDATE users SET xp = 0, streak = 0, last_day = NULL WHERE id = ?')->execute([$user['id']]);
            $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
            $stmt->execute([$user['id']]);
            respond(user_state($stmt->fetch()));
        }

        default:
            respond(['error' => 'Ação desconhecida.'], 404);
    }
} catch (Throwable $e) {
    try {
        if (db()->inTransaction()) db()->rollBack();
    } catch (Throwable) {
        // banco indisponível: nada para desfazer
    }
    error_log('[ingles] ' . $e->getMessage());
    respond(['error' => 'Erro no servidor.'], 500);
}
