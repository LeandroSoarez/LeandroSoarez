<?php
// Configuração compartilhada: conteúdo do curso, banco de dados e regras de XP.
declare(strict_types=1);

date_default_timezone_set('America/Sao_Paulo');

const PASS_RATIO = 0.7;
const EXTRA_EXERCISES = 4; // montar frase, ligar pares, ouvir e digitar (além do quiz)

function levels(): array
{
    static $levels = null;
    if ($levels === null) {
        $levels = json_decode(file_get_contents(__DIR__ . '/../data/levels.json'), true, 512, JSON_THROW_ON_ERROR);
    }
    return $levels;
}

function lesson_total(array $lesson): int
{
    return count($lesson['quiz']) + EXTRA_EXERCISES;
}

/** @return array<string, array{lesson: array, level: array}> */
function lessons_by_id(): array
{
    $map = [];
    foreach (levels() as $level) {
        foreach ($level['lessons'] as $lesson) {
            $map[$lesson['id']] = ['lesson' => $lesson, 'level' => $level];
        }
    }
    return $map;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];
    // Com DATABASE_URL (por exemplo, Neon na Vercel) usa Postgres; senão, SQLite em arquivo.
    $url = getenv('DATABASE_URL') ?: getenv('POSTGRES_URL');
    if ($url) {
        // O pooler do Neon (PgBouncer) não guarda consultas preparadas entre transações.
        $pdo = new PDO(postgres_dsn($url), null, null, $options + [PDO::ATTR_EMULATE_PREPARES => true]);
        $id = 'id SERIAL PRIMARY KEY';
    } else {
        $path = getenv('INGLES_DB_PATH') ?: __DIR__ . '/../data/ingles.sqlite';
        if (!is_writable(dirname($path))) {
            // Hospedagens sem disco gravável (como a Vercel) só permitem gravar na pasta temporária.
            $path = sys_get_temp_dir() . '/ingles.sqlite';
        }
        $pdo = new PDO('sqlite:' . $path, null, null, $options);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $id = 'id INTEGER PRIMARY KEY AUTOINCREMENT';
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        $id,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        xp INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        last_day TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id TEXT NOT NULL,
        best_score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, lesson_id)
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS achievements (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, code)
    )');
    return $pdo;
}

/** Converte postgres://usuario:senha@host:porta/banco?sslmode=require em DSN do PDO. */
function postgres_dsn(string $url): string
{
    $parts = parse_url($url);
    if (!$parts || empty($parts['host'])) {
        throw new RuntimeException('DATABASE_URL inválida.');
    }
    parse_str($parts['query'] ?? '', $query);
    $dsn = sprintf(
        'pgsql:host=%s;port=%d;dbname=%s;user=%s;password=%s;sslmode=%s',
        $parts['host'],
        $parts['port'] ?? 5432,
        ltrim($parts['path'] ?? '/postgres', '/'),
        rawurldecode($parts['user'] ?? ''),
        rawurldecode($parts['pass'] ?? ''),
        $query['sslmode'] ?? 'require'
    );
    // O Neon identifica o banco pelo nome do host; isso ajuda clientes sem suporte a SNI.
    if (str_ends_with($parts['host'], '.neon.tech')) {
        $endpoint = preg_replace('/-pooler$/', '', explode('.', $parts['host'])[0]);
        $dsn .= ";options='endpoint=$endpoint'";
    }
    return $dsn;
}

/** Catálogo de conquistas (as mesmas regras existem em js/app.js para o modo offline). */
function achievement_catalog(): array
{
    $list = [
        'first_lesson' => ['🎯', 'Primeiro passo', 'Conclua sua primeira lição'],
        'perfect'      => ['💯', 'Perfeccionista', 'Acerte 100% em uma lição'],
        'streak_3'     => ['🔥', 'Pegando fogo', 'Estude 3 dias seguidos'],
        'streak_7'     => ['🌋', 'Imparável', 'Estude 7 dias seguidos'],
        'xp_500'       => ['⚡', 'Energia total', 'Junte 500 XP'],
        'xp_2000'      => ['🌟', 'Estrela', 'Junte 2000 XP'],
    ];
    foreach (levels() as $level) {
        $list['level_' . $level['id']] = [$level['icon'], 'Nível ' . $level['code'], 'Conclua todas as lições do ' . $level['code']];
    }
    return $list;
}
