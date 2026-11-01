// Commit format (omni-plan §15): `RO-Txxx Summary`. The ticket is optional while work is unticketed.
module.exports = {
  parserPreset: { parserOpts: { headerPattern: /^((?:RO-T\d+)\s)?(.+)$/, headerCorrespondence: ['ticket', 'subject'] } },
  rules: {
    'header-max-length': [2, 'always', 120],
    'subject-empty': [2, 'never'],
    'header-full-stop': [2, 'never', '.'],
  },
};
