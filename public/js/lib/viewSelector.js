const CARD_LAYOUTS = {
  small: [
    { value: '2', label: '▦ Cards' },
  ],
  medium: [
    { value: '2', label: '▦ Cards · 2' },
    { value: '3', label: '▦ Cards · 3' },
  ],
  desktop: [
    { value: '1', label: '▦ Cards · 1 col' },
    { value: '2', label: '▦ Cards · 2 cols' },
    { value: '3', label: '▦ Cards · 3 cols' },
    { value: '4', label: '▦ Cards · 4 cols' },
  ],
};

/**
 * Build the combined results-view choices for the current note type.
 * Training is list-pane only; other date types retain their Cards option.
 */
export function buildResultsViewOptions({
  screen = 'desktop',
  isDateType = false,
  isTrainingType = false,
} = {}) {
  if (isTrainingType) {
    return [
      { value: 'calendar', label: '📅 Calendar' },
      { value: 'list', label: '☰ List' },
    ];
  }

  const cardLayouts = CARD_LAYOUTS[screen] || CARD_LAYOUTS.desktop;
  const listChoices = isDateType
    ? [
        { value: 'calendar', label: '📅 Calendar' },
        { value: 'list', label: '☰ List' },
      ]
    : [
        { value: 'list-pane', label: '☰ List' },
      ];

  return [
    ...cardLayouts,
    { value: 'gallery', label: '🖼 Gallery' },
    ...listChoices,
  ];
}

export function getResultsViewScreen(matchMedia) {
  if (matchMedia('(max-width: 767px)').matches) return 'small';
  if (matchMedia('(min-width: 768px) and (max-width: 1100px)').matches) return 'medium';
  return 'desktop';
}
