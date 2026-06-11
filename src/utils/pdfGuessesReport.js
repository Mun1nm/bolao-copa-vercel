const PAGE = {
  width: 210,
  height: 297,
  margin: 14
};

const COLORS = {
  ink: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  soft: '#f8fafc',
  primary: '#0f172a',
  danger: '#b91c1c'
};

const formatGeneratedAt = (date) => date.toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const toPdfText = (value) => String(value || '')
  .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
  .replace(/[\u2600-\u27BF]\uFE0F?/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const sanitizeFilename = (value) => String(value || 'bolao')
  .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
  .replace(/[\u2600-\u27BF]\uFE0F?/g, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9-_]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

const getMatchDateValue = (match) => {
  const value = match?.startAt || match?.date;
  if (!value) return 0;
  if (value?.toDate) return value.toDate().getTime();
  const date = new Date(typeof value === 'string' && value.length === 16 ? `${value}:00-03:00` : value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const fitText = (doc, value, maxWidth) => {
  const text = toPdfText(value);
  if (doc.getTextWidth(text) <= maxWidth) return text;

  let trimmed = text;
  while (trimmed.length > 0 && doc.getTextWidth(`${trimmed}...`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed ? `${trimmed}...` : '';
};

const loadImageDataUrl = (url) => new Promise((resolve) => {
  if (!url) {
    resolve(null);
    return;
  }

  let done = false;
  const finish = (value) => {
    if (done) return;
    done = true;
    clearTimeout(timeoutId);
    resolve(value);
  };
  const timeoutId = setTimeout(() => finish(null), 3000);
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      const size = 96;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;

      context.clearRect(0, 0, size, size);
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      finish(canvas.toDataURL('image/png'));
    } catch {
      finish(null);
    }
  };
  image.onerror = () => finish(null);
  image.src = url;
});

const preloadTeamImages = async (teams) => {
  const entries = await Promise.all(
    Object.values(teams).map(async (team) => [team.id, await loadImageDataUrl(team.flagUrl)])
  );

  return entries.reduce((acc, [teamId, dataUrl]) => {
    if (dataUrl) acc[teamId] = dataUrl;
    return acc;
  }, {});
};

const drawTeamMark = (doc, team, imageData, x, y, size = 8) => {
  if (imageData) {
    doc.addImage(imageData, 'PNG', x, y, size, size);
    doc.setDrawColor('#d1d5db');
    doc.circle(x + size / 2, y + size / 2, size / 2, 'S');
    return;
  }

  doc.setFillColor('#eef2f7');
  doc.circle(x + size / 2, y + size / 2, size / 2, 'F');
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text(toPdfText(team?.id || '?').slice(0, 3), x + size / 2, y + size / 2 + 1.8, { align: 'center' });
};

const drawFooter = (doc, pageNumber) => {
  doc.setDrawColor(COLORS.line);
  doc.line(PAGE.margin, PAGE.height - 12, PAGE.width - PAGE.margin, PAGE.height - 12);
  doc.setTextColor(COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Pagina ${pageNumber}`, PAGE.width - PAGE.margin, PAGE.height - 7, { align: 'right' });
};

const ensureSpace = (doc, cursor, neededHeight, pageNumberRef) => {
  if (cursor.y + neededHeight <= PAGE.height - 18) return cursor;

  drawFooter(doc, pageNumberRef.current);
  doc.addPage();
  pageNumberRef.current += 1;
  return { y: 18 };
};

const drawHeader = (doc, leagueName, generatedAt, stats) => {
  doc.setFillColor(COLORS.primary);
  doc.rect(0, 0, PAGE.width, 31, 'F');

  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Relatorio de Palpites', PAGE.margin, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(fitText(doc, leagueName || 'Bolao', 118), PAGE.margin, 20);
  doc.text(`Gerado em ${generatedAt}`, PAGE.margin, 26);

  const boxX = PAGE.width - PAGE.margin - 62;
  doc.setFillColor('#ffffff');
  doc.roundedRect(boxX, 7, 62, 17, 2, 2, 'F');

  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(stats.participants), boxX + 10, 15);
  doc.text(String(stats.matches), boxX + 33, 15);

  doc.setTextColor(COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('participantes', boxX + 10, 20);
  doc.text('jogos', boxX + 33, 20);
};

const drawParticipantHeader = (doc, member, cursor) => {
  doc.setFillColor('#dcfce7');
  doc.setDrawColor('#86efac');
  doc.roundedRect(PAGE.margin, cursor.y, PAGE.width - PAGE.margin * 2, 7.4, 1.5, 1.5, 'FD');

  doc.setTextColor('#14532d');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(fitText(doc, member.displayName || member.email || 'Participante', 140), PAGE.margin + 3, cursor.y + 4.9);

  doc.setTextColor('#166534');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.text(member.email ? fitText(doc, member.email, 62) : '', PAGE.width - PAGE.margin - 3, cursor.y + 4.9, { align: 'right' });

  return { y: cursor.y + 9.6 };
};

const drawMatchCard = (doc, match, guess, teams, images, x, y, width, height) => {
  const home = teams[match.homeTeamId] || { id: match.homeTeamId, name: match.homeTeamId };
  const away = teams[match.awayTeamId] || { id: match.awayTeamId, name: match.awayTeamId };
  const hasGuess = guess && guess.homeGuess !== undefined && guess.awayGuess !== undefined;

  doc.setFillColor('#ffffff');
  doc.setDrawColor(COLORS.line);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');

  const markSize = 5.2;
  const markY = y + (height - markSize) / 2;
  const textY = y + height / 2 + 1.4;
  drawTeamMark(doc, home, images[home.id], x + 1.6, markY, markSize);
  drawTeamMark(doc, away, images[away.id], x + width - 6.8, markY, markSize);

  doc.setTextColor(COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text(fitText(doc, home.id || '-', 12), x + 8.5, textY);
  doc.text(fitText(doc, away.id || '-', 12), x + width - 8.7, textY, { align: 'right' });

  doc.setTextColor(hasGuess ? COLORS.primary : COLORS.danger);
  doc.setFont('helvetica', hasGuess ? 'bold' : 'normal');
  doc.setFontSize(hasGuess ? 9.4 : 6.4);
  doc.text(hasGuess ? `${guess.homeGuess} x ${guess.awayGuess}` : 'Sem palpite', x + width / 2, textY, { align: 'center' });
};

const groupMatches = (matches) => matches.reduce((acc, match) => {
  const group = toPdfText(match.group || 'Sem grupo');
  if (!acc[group]) acc[group] = [];
  acc[group].push(match);
  return acc;
}, {});

const drawGroup = (doc, group, matches, guessesByMatch, teams, images, cursor) => {
  const cardGap = 2;
  const cardWidth = (PAGE.width - PAGE.margin * 2 - cardGap * 2) / 3;
  const cardHeight = 9.6;
  const rowGap = 1;
  const rows = Math.ceil(matches.length / 3);
  const blockHeight = 4.4 + rows * cardHeight + Math.max(0, rows - 1) * rowGap + 1.4;

  doc.setFillColor(COLORS.soft);
  doc.roundedRect(PAGE.margin, cursor.y, PAGE.width - PAGE.margin * 2, blockHeight, 1.5, 1.5, 'F');

  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.7);
  doc.text(`Grupo ${group}`, PAGE.margin + 2, cursor.y + 3.2);

  matches.forEach((match, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = PAGE.margin + 2 + col * (cardWidth + cardGap);
    const y = cursor.y + 4.4 + row * (cardHeight + rowGap);
    drawMatchCard(doc, match, guessesByMatch[match.id], teams, images, x, y, cardWidth - 1.4, cardHeight);
  });

  return { y: cursor.y + blockHeight + 1.3 };
};

export const generateGuessesPdf = async ({ league, members, matches, teams, guesses }) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const generatedAt = formatGeneratedAt(new Date());
  const activeMembers = members
    .filter((member) => member.status === 'active')
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'pt-BR'));
  const sortedMatches = [...matches].sort((a, b) => getMatchDateValue(a) - getMatchDateValue(b));
  const matchesByGroup = groupMatches(sortedMatches);
  const groupNames = Object.keys(matchesByGroup).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const guessesByUserAndMatch = guesses.reduce((acc, guess) => {
    if (!acc[guess.userId]) acc[guess.userId] = {};
    acc[guess.userId][guess.matchId] = guess;
    return acc;
  }, {});
  const images = await preloadTeamImages(teams);
  const pageNumberRef = { current: 1 };

  drawHeader(doc, league?.name, generatedAt, {
    participants: activeMembers.length,
    matches: sortedMatches.length
  });

  let cursor = { y: 39 };

  activeMembers.forEach((member) => {
    cursor = ensureSpace(doc, cursor, 20, pageNumberRef);
    cursor = drawParticipantHeader(doc, member, cursor);
    const guessesByMatch = guessesByUserAndMatch[member.uid] || {};

    groupNames.forEach((group) => {
      const groupRows = Math.ceil(matchesByGroup[group].length / 3);
      const estimatedHeight = 4.4 + groupRows * 9.6 + Math.max(0, groupRows - 1) * 1 + 2.7;
      cursor = ensureSpace(doc, cursor, estimatedHeight, pageNumberRef);
      cursor = drawGroup(
        doc,
        group,
        matchesByGroup[group],
        guessesByMatch,
        teams,
        images,
        cursor
      );
    });

    cursor = { y: cursor.y + 14 };
  });

  if (activeMembers.length === 0) {
    doc.setTextColor(COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Nenhum participante ativo encontrado.', PAGE.margin, cursor.y);
  }

  drawFooter(doc, pageNumberRef.current);
  doc.save(`palpites-${sanitizeFilename(league?.name)}.pdf`);
};
