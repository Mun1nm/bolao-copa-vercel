// src/utils/gameLogic.js

/**
 * Calcula os pontos baseados na regra:
 * 3 pts: Placar Exato
 * 1 pt:  Acertou o vencedor ou empate (mas errou o placar)
 * 0 pts: Errou tudo
 */
export const calculatePoints = (officialHome, officialAway, guessHome, guessAway) => {
  // Converte para inteiros para garantir
  const oH = parseInt(officialHome);
  const oA = parseInt(officialAway);
  const gH = parseInt(guessHome);
  const gA = parseInt(guessAway);

  // 1. Placar Exato (Cravada)
  if (oH === gH && oA === gA) {
    return 3;
  }

  // 2. Verificar Resultado (Quem ganhou ou se deu empate)
  const officialResult = oH > oA ? 'home' : oH < oA ? 'away' : 'draw';
  const guessResult = gH > gA ? 'home' : gH < gA ? 'away' : 'draw';

  if (officialResult === guessResult) {
    return 1;
  }

  // 3. Erro total
  return 0;
};