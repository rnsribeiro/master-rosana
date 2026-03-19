import { AnnualStatusCellStatus, AnnualStatusGrid } from "@/lib/finance/annualStatus";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function statusStyle(status: AnnualStatusCellStatus) {
  switch (status) {
    case "paid":
      return { fill: "#4ade80", text: "#052e16", label: "OK" };
    case "partial":
      return { fill: "#facc15", text: "#422006", label: "PARC" };
    case "due":
      return { fill: "#ef4444", text: "#450a0a", label: "" };
    case "no_fee_config":
      return { fill: "#cbd5e1", text: "#334155", label: "S/F" };
    default:
      return { fill: "#e5e7eb", text: "#6b7280", label: "-" };
  }
}

export function renderAnnualStatusSvg(
  grid: AnnualStatusGrid,
  options?: { generatedAtLabel?: string; lastUpdatedLabel?: string }
) {
  const padding = 28;
  const titleHeight = 34;
  const subtitleHeight = 24;
  const infoCardHeight = 44;
  const infoCardGap = 10;
  const infoSectionHeight = infoCardHeight * 2 + infoCardGap;
  const legendHeight = 28;
  const gapBeforeLegend = 12;
  const gapAfterLegend = 18;
  const headerHeight = 34;
  const rowHeight = 30;
  const bottomPadding = 20;
  const nameColWidth = 260;
  const monthColWidth = 88;
  const totalWidth = padding * 2 + nameColWidth + monthColWidth * 12;
  const totalHeight =
    padding * 2 +
    titleHeight +
    subtitleHeight +
    infoSectionHeight +
    gapBeforeLegend +
    legendHeight +
    gapAfterLegend +
    headerHeight +
    rowHeight * grid.rows.length +
    bottomPadding;

  const infoY = padding + titleHeight + subtitleHeight + 8;
  const legendY = infoY + infoSectionHeight + gapBeforeLegend;
  const headerY = legendY + legendHeight + gapAfterLegend;
  const bodyStartY = headerY + headerHeight;

  const legendItems = [
    { label: "Pago", color: "#4ade80" },
    { label: "Parcial", color: "#facc15" },
    { label: "Em aberto", color: "#ef4444" },
    { label: "Sem cobranca", color: "#e5e7eb" },
    { label: "Sem mensalidade configurada", color: "#cbd5e1" },
  ];

  const legend = legendItems
    .map((item, index) => {
      const x = padding + index * 178;
      const y = legendY;
      return [
        `<rect x="${x}" y="${y}" width="16" height="16" rx="4" fill="${item.color}" stroke="#94a3b8" />`,
        `<text x="${x + 24}" y="${y + 12}" font-size="12" fill="#334155">${escapeXml(item.label)}</text>`,
      ].join("");
    })
    .join("");

  const headerCells = [
    `<rect x="${padding}" y="${headerY}" width="${nameColWidth}" height="${headerHeight}" fill="#dbe4f0" stroke="#94a3b8" />`,
    `<text x="${padding + 12}" y="${headerY + 22}" font-size="13" font-weight="700" fill="#0f172a">Jogador</text>`,
    ...MONTH_NAMES.map((name, index) => {
      const x = padding + nameColWidth + index * monthColWidth;
      return [
        `<rect x="${x}" y="${headerY}" width="${monthColWidth}" height="${headerHeight}" fill="#dbe4f0" stroke="#94a3b8" />`,
        `<text x="${x + monthColWidth / 2}" y="${headerY + 22}" text-anchor="middle" font-size="12" font-weight="700" fill="#0f172a">${escapeXml(name)}</text>`,
      ].join("");
    }),
  ].join("");

  const rows = grid.rows
    .map((row, rowIndex) => {
      const y = bodyStartY + rowIndex * rowHeight;
      const nameFill = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";

      const playerCell = [
        `<rect x="${padding}" y="${y}" width="${nameColWidth}" height="${rowHeight}" fill="${nameFill}" stroke="#cbd5e1" />`,
        `<text x="${padding + 10}" y="${y + 20}" font-size="12" fill="#0f172a">${escapeXml(row.playerName)}</text>`,
      ].join("");

      const monthCells = row.months
        .map((month, monthIndex) => {
          const x = padding + nameColWidth + monthIndex * monthColWidth;
          const style = statusStyle(month.status);
          return [
            `<rect x="${x}" y="${y}" width="${monthColWidth}" height="${rowHeight}" fill="${style.fill}" stroke="#cbd5e1" />`,
            `<text x="${x + monthColWidth / 2}" y="${y + 20}" text-anchor="middle" font-size="11" font-weight="700" fill="${style.text}">${escapeXml(style.label)}</text>`,
          ].join("");
        })
        .join("");

      return `${playerCell}${monthCells}`;
    })
    .join("");

  const generatedAtLabel = options?.generatedAtLabel?.trim();
  const lastUpdatedLabel = options?.lastUpdatedLabel?.trim();
  const generatedText = generatedAtLabel
    ? `Gerado em ${generatedAtLabel}`
    : "Gerado automaticamente pelo sistema.";
  const lastUpdatedText = lastUpdatedLabel
    ? `Ultimo registro encontrado em ${lastUpdatedLabel}`
    : "Ultimo registro encontrado em: informacao indisponivel.";

  const infoCards = [
    {
      title: "ULTIMA ATUALIZACAO",
      value: lastUpdatedText,
      y: infoY,
      fill: "#dbeafe",
      stroke: "#60a5fa",
      titleColor: "#1d4ed8",
      valueColor: "#0f172a",
    },
    {
      title: "ARQUIVO GERADO",
      value: generatedText,
      y: infoY + infoCardHeight + infoCardGap,
      fill: "#fef3c7",
      stroke: "#f59e0b",
      titleColor: "#92400e",
      valueColor: "#451a03",
    },
  ]
    .map((card) => {
      const cardWidth = totalWidth - padding * 2;

      return [
        `<rect x="${padding}" y="${card.y}" width="${cardWidth}" height="${infoCardHeight}" rx="14" fill="${card.fill}" stroke="${card.stroke}" stroke-width="1.5" />`,
        `<text x="${padding + 16}" y="${card.y + 16}" font-size="11" font-weight="700" fill="${card.titleColor}">${escapeXml(card.title)}</text>`,
        `<text x="${padding + 16}" y="${card.y + 32}" font-size="13" font-weight="700" fill="${card.valueColor}">${escapeXml(card.value)}</text>`,
      ].join("");
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" role="img" aria-labelledby="title desc">
  <title id="title">Quadro anual de mensalidades ${grid.year}</title>
  <desc id="desc">Status mensal por jogador para o ano ${grid.year}.</desc>
  <rect width="100%" height="100%" fill="#f8fafc" />
  <text x="${padding}" y="${padding + 6}" font-size="26" font-weight="700" fill="#0f172a">Quadro anual de mensalidades ${grid.year}</text>
  <text x="${padding}" y="${padding + 30}" font-size="13" fill="#475569">Gerado automaticamente com base nas alocacoes, perdoes e periodos de participacao.</text>
  ${infoCards}
  ${legend}
  ${headerCells}
  ${rows}
</svg>`;
}
