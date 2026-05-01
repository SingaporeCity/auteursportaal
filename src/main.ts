/**
 * Entry point voor het Noordhoff Auteursportaal.
 *
 * Initialiseert routing, sessie-restore, dark-mode en koppelt de juiste view
 * (publieke marketing-site is bewust verwijderd in de productieversie; routes
 * gaan direct naar login of dashboard afhankelijk van auth-state).
 *
 * @module main
 */

import './styles/main.css';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root element in index.html');
}

root.textContent = 'Noordhoff Auteursportaal — boilerplate actief, modules komen.';
