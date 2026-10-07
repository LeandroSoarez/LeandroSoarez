# Inglês Passo a Passo 🦉

Site para aprender inglês nível por nível, do **A1 (iniciante)** ao **C2 (proficiente)**, com explicações em português.

**No ar:** https://ingles-passo-a-passo-three.vercel.app

## O que tem

- **Trilha de lições**: 26 níveis e 78 lições, divididos nas faixas A1, A2, B1, B2, C1 e C2 (por exemplo, A1.1 até A1.5). Cada lição libera a próxima, e cada nível concluído libera o seguinte.
- **5 tipos de exercício por lição**: múltipla escolha, ouvir e escolher, montar a frase, ligar pares e escrever a palavra.
- **Áudio e voz**: botão 🔊 para ouvir a pronúncia e 🎤 para treinar a fala (o reconhecimento de voz funciona no Chrome).
- **Gamificação**: XP, sequência de dias 🔥, conquistas, ranking, combo de acertos e confete ao concluir.
- **Conta sem senha**: a pessoa escolhe um nome e recebe um código de acesso para entrar em outro aparelho.
- **Modo offline**: se o PHP não responder, o progresso fica salvo no navegador.
- Funciona no celular e tem modo escuro automático.

## Tecnologias

PHP 8 com SQLite (PDO), HTML, CSS e JavaScript puro, sem frameworks.

## Como rodar

```bash
cd ingles
php -S localhost:8000
```

Depois abra http://localhost:8000.

O banco `data/ingles.sqlite` é criado sozinho na primeira visita. A pasta `data/` precisa ter permissão de escrita. Para guardar o banco em outro lugar, defina a variável `INGLES_DB_PATH`.

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.php` | Página principal; envia o conteúdo do curso para o navegador |
| `api.php` | API JSON: cadastro, progresso, XP, sequência, conquistas e ranking |
| `lib/bootstrap.php` | Conexão com o banco, criação das tabelas e regras compartilhadas |
| `data/levels.json` | Conteúdo das lições (explicação, vocabulário, exemplos e quiz) |
| `js/app.js` | Interface, exercícios, áudio e modo offline |
| `css/style.css` | Visual |

Para adicionar ou editar lições, basta mudar `data/levels.json`.

## Hospedagem

O site está publicado na **Vercel**, usando o runtime da comunidade [`vercel-php`](https://github.com/vercel-community/php) (PHP 8.5). O arquivo `vercel.json` manda a página para `api/index.php` e a API para `api/api.php`, e bloqueia o acesso às pastas `data/` e `lib/`.

**Banco de dados:** se a variável `DATABASE_URL` (ou `POSTGRES_URL`) existir, o site usa **Postgres** (por exemplo, o Neon da Vercel) e guarda tudo de forma permanente. Sem ela, usa **SQLite**. Na Vercel não existe disco permanente, então o SQLite fica na pasta temporária e pode ser apagado quando o servidor reinicia. Nesse caso, o navegador guarda uma cópia da conta e a recria sozinho no servidor.

Também funciona em qualquer hospedagem comum com PHP 8 e SQLite. Em servidores Apache, os arquivos `.htaccess` bloqueiam o acesso direto às pastas `data/` e `lib/`. Em Nginx, bloqueie essas pastas na configuração do servidor.
