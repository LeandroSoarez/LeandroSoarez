<?php
// Senha de entrada do site (variável de ambiente SITE_PASSWORD).
// Sem a variável, o site fica aberto para qualquer pessoa.
declare(strict_types=1);

const SITE_COOKIE = 'acesso';
const SITE_COOKIE_DAYS = 365;

function site_password(): string
{
    return (string) getenv('SITE_PASSWORD');
}

function site_token(int $expires): string
{
    return $expires . '.' . hash_hmac('sha256', "site|$expires", site_password());
}

function site_unlocked(): bool
{
    if (site_password() === '') return true;
    $cookie = $_COOKIE[SITE_COOKIE] ?? '';
    $expires = (int) strtok($cookie, '.');
    return $expires > time() && hash_equals(site_token($expires), $cookie);
}

/** Confere a senha digitada e, se estiver certa, grava o cookie de acesso. */
function site_unlock(string $typed): bool
{
    if (site_password() === '' || !hash_equals(site_password(), $typed)) return false;
    $expires = time() + SITE_COOKIE_DAYS * 86400;
    $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    setcookie(SITE_COOKIE, site_token($expires), [
        'expires' => $expires,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    return true;
}
