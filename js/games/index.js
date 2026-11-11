// Lista de minijuegos. Para añadir uno nuevo: crea su archivo y añádelo aquí.
import duelo from './duelo.js';
import barredora from './barredora.js';
import pintapisos from './pintapisos.js';
import suelo from './suelo.js';
import bomba from './bomba.js';

export const GAMES = [suelo, barredora, pintapisos, bomba, duelo];
export const gameById = (id) => GAMES.find((g) => g.id === id);
