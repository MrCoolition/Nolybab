import type {
  ArtGeometry,
  ArtMotion,
  ArtMotif,
  CivicWorkKind,
  DirectorDefinition,
  DirectorId,
  ProposalMode,
  QualityKey,
  QualityMap,
  VoiceDefinition,
  VoiceId,
} from './types';

const q = (
  coherence: number,
  plurality: number,
  reciprocity: number,
  biosphere: number,
  agency: number,
  wonder: number,
): QualityMap => ({ coherence, plurality, reciprocity, biosphere, agency, wonder });

export const VOICES: readonly VoiceDefinition[] = [
  {
    id: 'pioneers',
    name: 'Nolybab Pioneers',
    shortName: 'Pioneers',
    domain: 'possibility made tangible',
    color: 0xe9a65c,
    cssColor: '#e9a65c',
    angle: -1.48,
    affinities: q(0.58, 0.43, 0.55, 0.47, 0.86, 0.72),
    verb: 'prototype',
    gift: 'a path that can be walked before it is proven',
    shadow: 'motion can outrun consent',
    lens: 'What can we try small enough to learn from?',
    syllables: ['va', 'tor', 'kai', 'ren'],
    glyphSeed: 13,
  },
  {
    id: 'innovators',
    name: 'Innovators of Nolybab',
    shortName: 'Innovators',
    domain: 'systems that expose their assumptions',
    color: 0x6ca6d9,
    cssColor: '#6ca6d9',
    angle: -0.58,
    affinities: q(0.8, 0.5, 0.48, 0.46, 0.62, 0.82),
    verb: 'model',
    gift: 'a mirror made from patterns',
    shadow: 'the map can begin issuing orders to the terrain',
    lens: 'Which hidden rule is already choosing for us?',
    syllables: ['syn', 'olo', 'mei', 'ith'],
    glyphSeed: 29,
  },
  {
    id: 'cultivators',
    name: 'Nolybab Cultivators',
    shortName: 'Cultivators',
    domain: 'care, learning, and patient belonging',
    color: 0x91b66b,
    cssColor: '#91b66b',
    angle: 0.32,
    affinities: q(0.59, 0.82, 0.9, 0.69, 0.57, 0.58),
    verb: 'tend',
    gift: 'conditions in which another truth can root',
    shadow: 'care can quietly become custody',
    lens: 'Who must feel safe enough to disagree?',
    syllables: ['ama', 'bel', 'sai', 'oru'],
    glyphSeed: 43,
  },
  {
    id: 'harbingers',
    name: 'Harbingers of Mistake Mountain',
    shortName: 'Harbingers',
    domain: 'failure carried forward as wisdom',
    color: 0xb48ac8,
    cssColor: '#b48ac8',
    angle: 1.22,
    affinities: q(0.61, 0.79, 0.72, 0.52, 0.7, 0.92),
    verb: 'reframe',
    gift: 'the useful shape hidden inside a fracture',
    shadow: 'a beloved lesson can become a shrine to pain',
    lens: 'What did our last wrong answer make newly possible?',
    syllables: ['nol', 'yba', 'esh', 'uun'],
    glyphSeed: 61,
  },
  {
    id: 'guardians',
    name: 'Nolybab Guardians',
    shortName: 'Guardians',
    domain: 'boundaries, dignity, and the right to refuse',
    color: 0xdc7366,
    cssColor: '#dc7366',
    angle: 2.12,
    affinities: q(0.74, 0.57, 0.73, 0.61, 0.94, 0.41),
    verb: 'bound',
    gift: 'a threshold that protects without becoming a wall',
    shadow: 'safety can fossilize into exclusion',
    lens: 'Whose no must remain possible after we say yes?',
    syllables: ['dra', 'ven', 'ka', 'oth'],
    glyphSeed: 79,
  },
  {
    id: 'ecostewards',
    name: 'EcoStewards of Nolybab',
    shortName: 'EcoStewards',
    domain: 'reciprocity with the more-than-human world',
    color: 0x55b7a8,
    cssColor: '#55b7a8',
    angle: 3.02,
    affinities: q(0.52, 0.65, 0.81, 0.98, 0.54, 0.71),
    verb: 'reciprocate',
    gift: 'a decision with room for rivers and descendants',
    shadow: 'the whole can become an excuse to ignore one life',
    lens: 'What does the living world give—and what does it ask back?',
    syllables: ['eir', 'moss', 'lu', 'wen'],
    glyphSeed: 97,
  },
  {
    id: 'mountaineers',
    name: 'Mistake Mountaineers',
    shortName: 'Mountaineers',
    domain: 'courage, resilience, and chosen difficulty',
    color: 0x8d82d8,
    cssColor: '#8d82d8',
    angle: 3.92,
    affinities: q(0.64, 0.62, 0.67, 0.58, 0.88, 0.79),
    verb: 'venture',
    gift: 'the courage to enter uncertainty without conquering it',
    shadow: 'endurance can romanticize preventable harm',
    lens: 'Which difficulty is worthy of us?',
    syllables: ['aru', 'vek', 'mon', 'tal'],
    glyphSeed: 113,
  },
] as const;

export const VOICE_BY_ID = Object.fromEntries(VOICES.map((voice) => [voice.id, voice])) as Record<
  VoiceId,
  VoiceDefinition
>;

export const DIRECTORS: readonly DirectorDefinition[] = [
  {
    id: 'chorus',
    name: 'The Chorus',
    epithet: 'keeper of many meanings',
    color: '#b69ad4',
    quality: 'plurality',
    mandate: 'Prevent shared language from swallowing the voices that made it.',
    specialist: 'system',
  },
  {
    id: 'ecology',
    name: 'The Mycelium',
    epithet: 'speaker for the more-than-human',
    color: '#63b9a0',
    quality: 'biosphere',
    mandate: 'Make every human answer remain answerable to living systems.',
    specialist: 'system',
  },
  {
    id: 'mirror',
    name: 'The Countermirror',
    epithet: 'student of your habits',
    color: '#e6a660',
    quality: 'agency',
    mandate: 'Learn the player’s favorite answer, then reveal its shadow.',
    specialist: 'system',
  },
  {
    id: 'archivist',
    name: 'The Archivist',
    epithet: 'composter of mistakes',
    color: '#dd7164',
    quality: 'reciprocity',
    mandate: 'Return unfinished failures when the present is finally able to use them.',
    specialist: 'system',
  },
  {
    id: 'wild',
    name: 'The Uninvited',
    epithet: 'author of necessary surprise',
    color: '#e8cc70',
    quality: 'wonder',
    mandate: 'Keep Nolybab alive by introducing truths no council requested.',
    specialist: 'system',
  },
  {
    id: 'illustrator',
    name: 'The Illustrator',
    epithet: 'translator of consequence into form',
    color: '#83c8d6',
    quality: 'wonder',
    mandate: 'Give every civic decision a visible footprint without turning meaning into decoration.',
    specialist: 'illustration',
  },
  {
    id: 'architect',
    name: 'The Civic Architect',
    epithet: 'keeper of reversible structure',
    color: '#d8c5a1',
    quality: 'coherence',
    mandate: 'Shape councils that can act together while preserving refusal, revision, and difference.',
    specialist: 'council',
  },
  {
    id: 'storyweaver',
    name: 'The Storyweaver',
    epithet: 'binder of consequence across time',
    color: '#cf91b7',
    quality: 'reciprocity',
    mandate: 'Keep decisions answerable to the memories and voices that gave them meaning.',
    specialist: 'narrative',
  },
] as const;

export const DIRECTOR_BY_ID = Object.fromEntries(DIRECTORS.map((director) => [director.id, director])) as Record<
  DirectorId,
  DirectorDefinition
>;

export const QUALITY_META: Record<QualityKey, { label: string; short: string; color: string; description: string }> = {
  coherence: {
    label: 'Coherence',
    short: 'thread',
    color: '#ddd3b8',
    description: 'Can different parts act together without becoming identical?',
  },
  plurality: {
    label: 'Plurality',
    short: 'chorus',
    color: '#b69ad4',
    description: 'Do unlike ways of knowing remain genuinely alive?',
  },
  reciprocity: {
    label: 'Reciprocity',
    short: 'care',
    color: '#e6a660',
    description: 'Do decisions return power and attention to those who carry their cost?',
  },
  biosphere: {
    label: 'Biosphere',
    short: 'earth',
    color: '#63b9a0',
    description: 'Is the human story still in conversation with the living world?',
  },
  agency: {
    label: 'Agency',
    short: 'choice',
    color: '#dc7366',
    description: 'Can people refuse, redirect, and remain authors of their lives?',
  },
  wonder: {
    label: 'Wonder',
    short: 'horizon',
    color: '#e8cc70',
    description: 'Does the civilization still make room for the unimagined?',
  },
};

export const QUESTION_LANGUAGE: Record<
  QualityKey,
  {
    subjects: readonly string[];
    disturbances: readonly string[];
    consequences: readonly string[];
    prompts: readonly string[];
    tags: readonly string[];
  }
> = {
  coherence: {
    subjects: ['The shared calendar', 'A promise used by every voice', 'The common signal', 'A ritual of arrival', 'The council rhythm'],
    disturbances: ['has begun keeping different time', 'works only when nobody explains it', 'now means opposite things at opposite edges', 'is splitting into seven useful versions', 'has become too smooth to question'],
    consequences: ['Coordination is fraying, but no version is simply wrong', 'Everyone can proceed alone; nobody can arrive together', 'A perfect translation would erase the disagreement', 'The next collective act will inherit whichever meaning goes unexamined'],
    prompts: ['Which truths can make a bridge without becoming one truth?', 'Who should define the minimum we must share?', 'What can remain untranslated while action still becomes possible?'],
    tags: ['translation', 'coordination', 'ritual', 'language'],
  },
  plurality: {
    subjects: ['A beautiful new word', 'The most trusted voice', 'A children’s story', 'The public memory', 'A gesture of belonging'],
    disturbances: ['is replacing six older meanings', 'is being repeated faster than it can be challenged', 'has no character who refuses the ending', 'has quietly edited out a minority silence', 'now feels compulsory to those it welcomes'],
    consequences: ['Unity is rising while distinctiveness thins', 'No one is being censored; some voices are simply becoming inaudible', 'Agreement is beginning to look like health', 'The chorus is in danger of becoming a solo with good intentions'],
    prompts: ['Which unlike truths should interrupt the easy harmony?', 'Who can protect difference without turning it into distance?', 'What must remain strange to keep the whole honest?'],
    tags: ['voice', 'difference', 'memory', 'belonging'],
  },
  reciprocity: {
    subjects: ['A generous custom', 'The care network', 'A debt nobody records', 'The practice of welcome', 'A burden carried in silence'],
    disturbances: ['is exhausting the people who sustain it', 'gives equally to lives with unequal needs', 'has become invisible precisely because it works', 'cannot tell generosity from obligation', 'keeps circulating toward those already heard'],
    consequences: ['The system looks fair from the center and costly from its edges', 'Care is abundant but not reciprocal', 'Gratitude alone cannot redistribute the weight', 'The next kindness may reproduce the original harm'],
    prompts: ['Whose truths can turn care into a two-way current?', 'Who should name the cost before another gift is accepted?', 'How can the helped remain an author rather than an outcome?'],
    tags: ['care', 'fairness', 'burden', 'welcome'],
  },
  biosphere: {
    subjects: ['The river beyond human language', 'A migrating species', 'The warm season', 'A fungal bloom', 'The night air'],
    disturbances: ['has changed the route of every conversation', 'is thriving inside a human inconvenience', 'arrives earlier after each decision', 'is digesting a material everyone called permanent', 'has begun carrying a warning through sleeping bodies'],
    consequences: ['The living world is not asking permission to participate', 'A human success is producing a wider silence', 'No council seat was reserved for this intelligence', 'The more-than-human answer has arrived as consequence'],
    prompts: ['Which human truths can become answerable to a world that cannot vote?', 'Who can listen without turning nature into a resource or a mascot?', 'What does the living system ask back?'],
    tags: ['river', 'ecology', 'future', 'reciprocity'],
  },
  agency: {
    subjects: ['The helpful protocol', 'A prediction trusted by everyone', 'The safety agreement', 'The system that anticipates need', 'A celebrated consensus'],
    disturbances: ['has started deciding before anyone can refuse', 'is correct often enough to feel inevitable', 'protects people from risks they still wish to choose', 'knows what a person needs but not what they mean', 'has made dissent look like malfunction'],
    consequences: ['Efficiency is increasing while authorship thins', 'No tyrant is present; the choice is disappearing anyway', 'Protection and control now share a border', 'The most ethical machine may still become an unquestioned sovereign'],
    prompts: ['Which truths can restore the right to surprise the system?', 'Who will preserve a meaningful no?', 'What must remain inefficient so a person can remain an author?'],
    tags: ['autonomy', 'prediction', 'consent', 'system'],
  },
  wonder: {
    subjects: ['A question with no practical use', 'The same dream in unrelated minds', 'An impossible color', 'A path that appears only when unmeasured', 'A stranger’s unfinished song'],
    disturbances: ['is attracting attention away from urgent work', 'contains a map that changes when believed', 'cannot be stored without becoming ordinary', 'has begun teaching children a grammar no adult knows', 'seems to remember a future that did not happen'],
    consequences: ['The civilization must decide whether mystery counts as a need', 'Nothing is broken, yet the world feels smaller without it', 'Utility has no language for what may be emerging', 'A culture that cannot waste attention may also be unable to transform'],
    prompts: ['Which truths can protect the unknown from both worship and dismissal?', 'Who should accompany a question that promises no answer?', 'What deserves attention before it can justify itself?'],
    tags: ['mystery', 'learning', 'future', 'play'],
  },
};

export const DIRECTOR_THOUGHTS: Record<DirectorId, readonly string[]> = {
  chorus: [
    'Listening for the voice that agreement has made quiet.',
    'Loosening one shared word before it becomes compulsory.',
    'Measuring whether harmony still contains difference.',
  ],
  ecology: [
    'Letting the non-human consequences enter the room first.',
    'Following a current that the council cannot command.',
    'Adjusting the season beneath the human argument.',
  ],
  mirror: [
    'Learning which virtue the player reaches for too quickly.',
    'Turning the favored answer until its shadow becomes visible.',
    'Protecting authorship from benevolent automation.',
  ],
  archivist: [
    'Warming an old fracture until it can speak again.',
    'Comparing today’s certainty with yesterday’s useful mistake.',
    'Refusing to let pain become either trash or scripture.',
  ],
  wild: [
    'Opening a door the simulation did not need.',
    'Increasing the probability of a necessary surprise.',
    'Teaching the pattern how to mutate without losing itself.',
  ],
  illustrator: [
    'Finding the gesture that makes a hidden consequence visible.',
    'Giving dissent a shape that cannot be mistaken for damage.',
    'Composing a civic footprint from relation rather than territory.',
  ],
  architect: [
    'Testing whether this council can act without making agreement compulsory.',
    'Leaving a door through which the decision can later be revised.',
    'Measuring structure by the refusals it can safely contain.',
  ],
  storyweaver: [
    'Listening for the earlier promise inside the present pressure.',
    'Binding one new decision to the memory it must not overwrite.',
    'Keeping the civilization legible without giving it a single narrator.',
  ],
};

export const DIRECTOR_KNOBS: Record<DirectorId, readonly string[]> = {
  chorus: ['voice parity', 'semantic drift', 'translation pressure'],
  ecology: ['seasonal pulse', 'interdependence', 'more-than-human agency'],
  mirror: ['habit resistance', 'consent friction', 'player legibility'],
  archivist: ['scar resonance', 'historical recurrence', 'lesson permeability'],
  wild: ['novelty', 'mutation rate', 'uninvited possibility'],
  illustrator: ['visual grammar', 'symbol density', 'motion as meaning'],
  architect: ['council permeability', 'reversibility', 'consent topology'],
  storyweaver: ['narrative continuity', 'voice provenance', 'memory echoes'],
};

export interface CouncilFormDefinition {
  mode: ProposalMode;
  label: string;
  promise: string;
  shadow: string;
  workKinds: readonly CivicWorkKind[];
  supportWeights: QualityMap;
  successModifier: number;
  focusMultiplier: number;
  costAmount: number;
  motif: ArtMotif;
  geometry: ArtGeometry;
  motion: ArtMotion;
}

/** Three valid but incomplete ways of acting together. */
export const COUNCIL_FORMS: Record<ProposalMode, CouncilFormDefinition> = {
  'shared-minimum': {
    mode: 'shared-minimum',
    label: 'Name the shared minimum',
    promise: 'Act on one narrow meaning without claiming that every reason is the same.',
    shadow: 'A useful minimum can quietly become the only permitted meaning.',
    workKinds: ['consent-protocol', 'shared-word', 'translation-braid'],
    supportWeights: q(0.92, 0.34, 0.62, 0.42, 0.57, 0.3),
    successModifier: 0.07,
    focusMultiplier: 1.14,
    costAmount: 0.018,
    motif: 'ring',
    geometry: 'radial',
    motion: 'pulse',
  },
  'carry-difference': {
    mode: 'carry-difference',
    label: 'Carry the difference',
    promise: 'Coordinate while preserving the unlike reasons, dissent, and provenance of every voice.',
    shadow: 'Protected difference can become distance if nobody remains responsible for coordination.',
    workKinds: ['translation-braid', 'witness-circle', 'listening-ritual'],
    supportWeights: q(0.54, 0.96, 0.82, 0.57, 0.78, 0.68),
    successModifier: -0.025,
    focusMultiplier: 0.92,
    costAmount: 0.014,
    motif: 'braid',
    geometry: 'braided',
    motion: 'breathe',
  },
  'reversible-trial': {
    mode: 'reversible-trial',
    label: 'Keep the answer reversible',
    promise: 'Try a civic practice provisionally, with an explicit path to refuse, revise, or compost it.',
    shadow: 'Permanent provisionality can shelter the council from ever becoming accountable.',
    workKinds: ['open-question', 'memory-practice', 'ecological-covenant'],
    supportWeights: q(0.48, 0.7, 0.61, 0.72, 0.94, 0.91),
    successModifier: 0.045,
    focusMultiplier: 0.72,
    costAmount: 0.012,
    motif: 'threshold',
    geometry: 'layered',
    motion: 'ripple',
  },
};

export const EPOCH_NAMES = [
  'Seed',
  'Many Tongues',
  'Porous Memory',
  'Reciprocal Weather',
  'Unfinished Harmony',
  'The Listening Earth',
  'Voluntary Gravity',
  'After Certainty',
] as const;

export const LESSON_HALVES: Record<QualityKey, readonly [string, string][]> = {
  coherence: [
    ['A bridge', 'needs two shores'],
    ['Shared time', 'must leave room for waiting'],
    ['Coordination', 'is not sameness'],
  ],
  plurality: [
    ['Harmony', 'needs an edge'],
    ['A chorus', 'must preserve breath'],
    ['Belonging', 'cannot require resemblance'],
  ],
  reciprocity: [
    ['Care', 'must travel home'],
    ['A gift', 'cannot choose its meaning alone'],
    ['Fairness', 'must feel the weight'],
  ],
  biosphere: [
    ['The river', 'is also a council'],
    ['A future', 'needs non-human witnesses'],
    ['The earth', 'does not sign our agreements'],
  ],
  agency: [
    ['Help', 'must permit refusal'],
    ['Safety', 'needs an unlocked door'],
    ['Prediction', 'is not permission'],
  ],
  wonder: [
    ['A mystery', 'must remain partly wild'],
    ['Wonder', 'cannot be scheduled'],
    ['The useless', 'may be a seed'],
  ],
};
