# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's [private vulnerability reporting](https://github.com/Nithinfgs/timefuse/security/advisories/new) rather than a public issue. Expect an acknowledgement within a week.

## Scope and design notes

- timefuse only **reads** files under the directory you point it at. It never writes to the scanned repository.
- The only network request is `timefuse update-data`, which downloads public JSON from `endoflife.date`.
- Hard-coded JWTs are decoded locally to read the `exp` claim. They are never verified or sent anywhere, and reports show only the first ten characters.
- Certificates are parsed with Node's built-in `crypto.X509Certificate`.
