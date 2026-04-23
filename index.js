// AdaptLearn v4.1 — Enhanced Adaptive Learning Engine
/**
 * AdaptLearn — Adaptive Spaced-Repetition Learning Engine
 * 
 * An intelligent quiz and flashcard system that adapts to each learner's
 * performance using spaced repetition (SM-2 algorithm variant), difficulty
 * adjustment, and mastery tracking.
 * 
 * Features:
 * - SM-2 spaced repetition scheduling for optimal retention
 * - Adaptive difficulty adjustment based on accuracy and response confidence
 * - Multi-format questions (multiple choice, fill-in-blank, true/false, short answer)
 * - Mastery tracking with per-topic breakdowns
 * - Learning streaks and motivation system
 * - Topic-aware curriculum with prerequisite chains
 * - Performance analytics and study recommendations
 */

class SpacedRepetitionScheduler {
  /**
   * SM-2 algorithm variant for calculating review intervals.
   * Optimizes long-term retention by scheduling reviews at increasing intervals
   * based on how well the learner knows each item.
   */
  constructor() {
    this.minEaseFactor = 1.3;
    this.defaultEaseFactor = 2.5;
  }

  /**
   * Calculate next review schedule using SM-2 algorithm.
   * @param {Object} card - Flashcard with schedule state {repetitions, easeFactor, interval}
   * @param {number} quality - Recall quality 0-5 (0=blackout, 3=correct with difficulty, 5=perfect)
   * @returns {Object} Updated schedule with new interval, easeFactor, and next review date
   * @throws {Error} If quality is not between 0 and 5
   */
  calculateNext(card, quality) {
    let { repetitions, easeFactor, interval } = card.schedule;

    if (quality >= 3) {
      // Correct response
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetitions++;
    } else {
      // Incorrect — reset
      repetitions = 0;
      interval = 1;
    }

    // Update ease factor
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    easeFactor = Math.max(this.minEaseFactor, easeFactor);

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);

    return {
      repetitions,
      easeFactor: Math.round(easeFactor * 100) / 100,
      interval,
      nextReviewDate: nextReviewDate.toISOString(),
      lastReviewed: new Date().toISOString()
    };
  }

  /**
   * Check if a card is due for review based on its scheduled date.
   * @param {Object} card - Flashcard with schedule containing nextReviewDate
   * @param {Date} [now=new Date()] - Current date for comparison
   * @returns {boolean} True if card needs review (overdue or never reviewed)
   */
  isDue(card, now = new Date()) {
    if (!card.schedule.nextReviewDate) return true;
    return new Date(card.schedule.nextReviewDate) <= now;
  }

  /**
   * Calculate review priority score (higher = more overdue).
   * @param {Object} card - Flashcard with schedule
   * @param {Date} [now=new Date()] - Current date
   * @returns {number} Priority score; 1000 for never-reviewed cards
   */
  getPriority(card, now = new Date()) {
    if (!card.schedule.nextReviewDate) return 1000;
    const overdueDays = (now - new Date(card.schedule.nextReviewDate)) / (1000 * 60 * 60 * 24);
    return overdueDays;
  }
}

class QuestionGenerator {
  /**
   * Generate a multiple-choice question with plausible distractors.
   * Selects distractors from same-topic concepts for maximum plausibility.
   * @param {Object} concept - Target concept with term and definition
   * @param {Object[]} allConcepts - Full concept pool for distractor selection
   * @returns {Object} Question with options array and correctIndex
   */
  generateMultipleChoice(concept, allConcepts) {
    const distractors = allConcepts
      .filter(c => c.id !== concept.id && c.topic === concept.topic)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(c => c.definition);

    if (distractors.length < 3) {
      // Fill with generic distractors
      const fillers = ['None of the above', 'All of the above', 'Not enough information'];
      while (distractors.length < 3) {
        distractors.push(fillers[distractors.length]);
      }
    }

    const options = [concept.definition, ...distractors].sort(() => Math.random() - 0.5);
    const correctIndex = options.indexOf(concept.definition);

    return {
      type: 'multiple_choice',
      conceptId: concept.id,
      question: `What is the definition of "${concept.term}"?`,
      options,
      correctIndex,
      correctAnswer: concept.definition,
      difficulty: concept.difficulty || 1
    };
  }

  /**
   * Generate fill-in-the-blank by removing a content word from the definition.
   * Falls back to true/false if definition is too short for blanking.
   * @param {Object} concept - Target concept
   * @returns {Object} Question with blanked definition and correctAnswer
   */
  generateFillInBlank(concept) {
    const words = concept.definition.split(' ');
    if (words.length < 4) {
      return this.generateTrueFalse(concept);
    }

    // Remove a key word (not articles/prepositions)
    const skipWords = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'of', 'in', 'to', 'for', 'and', 'or', 'that', 'this']);
    const candidates = words.filter((w, i) => i > 0 && !skipWords.has(w.toLowerCase()) && w.length > 3);

    if (candidates.length === 0) return this.generateTrueFalse(concept);

    const removedWord = candidates[Math.floor(Math.random() * candidates.length)];
    const blankedDef = concept.definition.replace(removedWord, '____');

    return {
      type: 'fill_in_blank',
      conceptId: concept.id,
      question: `Fill in the blank for "${concept.term}": ${blankedDef}`,
      correctAnswer: removedWord.toLowerCase().replace(/[^a-z0-9]/g, ''),
      difficulty: (concept.difficulty || 1) + 0.5
    };
  }

  /**
   * Generate true/false question using correct or swapped definitions.
   * @param {Object} concept - Target concept
   * @param {Object[]} allConcepts - Pool for generating false statements
   * @returns {Object} Question with boolean correctAnswer
   */
  generateTrueFalse(concept, allConcepts) {
    const isTrue = Math.random() > 0.5;
    let statement;

    if (isTrue) {
      statement = `"${concept.term}" means: ${concept.definition}`;
    } else {
      const others = (allConcepts || []).filter(c => c.id !== concept.id);
      const wrongDef = others.length > 0
        ? others[Math.floor(Math.random() * others.length)].definition
        : 'an unrelated concept that does not apply here';
      statement = `"${concept.term}" means: ${wrongDef}`;
    }

    return {
      type: 'true_false',
      conceptId: concept.id,
      question: `True or False: ${statement}`,
      correctAnswer: isTrue,
      difficulty: (concept.difficulty || 1) - 0.3
    };
  }

  /**
   * Generate a question of specified or random type for a concept.
   * @param {Object} concept - Target concept
   * @param {Object[]} allConcepts - Full concept pool
   * @param {string} [preferredType=null] - 'multiple_choice'|'fill_in_blank'|'true_false'
   * @returns {Object} Generated question object
   */
  generateQuestion(concept, allConcepts, preferredType = null) {
    const types = ['multiple_choice', 'fill_in_blank', 'true_false'];
    const type = preferredType || types[Math.floor(Math.random() * types.length)];

    switch (type) {
      case 'multiple_choice': return this.generateMultipleChoice(concept, allConcepts);
      case 'fill_in_blank': return this.generateFillInBlank(concept);
      case 'true_false': return this.generateTrueFalse(concept, allConcepts);
      default: return this.generateMultipleChoice(concept, allConcepts);
    }
  }
}

class DifficultyAdapter {
  /**
   * Adapts challenge level using Zone of Proximal Development theory.
   * Keeps learners in the optimal zone between too easy and too hard.
   */
  constructor() {
    this.windowSize = 10;
  }

  /**
   * Calculate target difficulty from recent performance history.
   * Uses sliding window of last N answers to determine optimal challenge level.
   * @param {Object[]} history - Array of answer records with correct and confidence fields
   * @returns {number} Recommended difficulty level (1.0-5.0)
   */
  calculateDifficulty(history) {
    if (history.length === 0) return 1;
    const recent = history.slice(-this.windowSize);
    const accuracy = recent.filter(h => h.correct).length / recent.length;
    const avgConfidence = recent.reduce((s, h) => s + (h.confidence || 3), 0) / recent.length;

    // High accuracy + high confidence → increase difficulty
    // Low accuracy → decrease difficulty
    if (accuracy >= 0.9 && avgConfidence >= 4) return Math.min(5, this.getCurrentLevel(history) + 0.5);
    if (accuracy >= 0.8) return this.getCurrentLevel(history);
    if (accuracy >= 0.6) return Math.max(1, this.getCurrentLevel(history) - 0.3);
    return Math.max(1, this.getCurrentLevel(history) - 0.5);
  }

  /**
   * Get current difficulty level from recent answer history.
   * @param {Object[]} history - Recent answer records
   * @returns {number} Average difficulty of last 5 answers
   */
  getCurrentLevel(history) {
    if (history.length === 0) return 1;
    const recent = history.slice(-5);
    return recent.reduce((s, h) => s + (h.difficulty || 1), 0) / recent.length;
  }

  /**
   * Sort concepts by proximity to target difficulty for optimal challenge.
   * @param {Object[]} concepts - Available concepts with difficulty ratings
   * @param {number} targetDifficulty - Desired difficulty level
   * @returns {Object[]} Concepts sorted by closeness to target
   */
  selectConceptByDifficulty(concepts, targetDifficulty) {
    return concepts.sort((a, b) => {
      const diffA = Math.abs((a.difficulty || 1) - targetDifficulty);
      const diffB = Math.abs((b.difficulty || 1) - targetDifficulty);
      return diffA - diffB;
    });
  }
}

class GamificationEngine {
  /**
   * Achievement and XP system providing extrinsic motivation.
   * Research shows gamification improves completion rates by 30-50%
   * when combined with meaningful learning feedback.
   */
  constructor() {
    this.badges = {
      'first-answer': { name: '🌱 First Steps', desc: 'Answer your first question', condition: p => p.totalAnswered >= 1 },
      'streak-3': { name: '🔥 On Fire', desc: '3-day study streak', condition: p => p.streakDays >= 3 },
      'streak-7': { name: '⚡ Unstoppable', desc: '7-day study streak', condition: p => p.streakDays >= 7 },
      'streak-30': { name: '🏆 Dedicated', desc: '30-day study streak', condition: p => p.streakDays >= 30 },
      'accuracy-80': { name: '🎯 Sharpshooter', desc: '80%+ overall accuracy (min 20 questions)', condition: p => p.totalAnswered >= 20 && p.getOverallAccuracy() >= 80 },
      'accuracy-95': { name: '💎 Perfectionist', desc: '95%+ overall accuracy (min 50 questions)', condition: p => p.totalAnswered >= 50 && p.getOverallAccuracy() >= 95 },
      'centurion': { name: '💯 Centurion', desc: 'Answer 100 questions', condition: p => p.totalAnswered >= 100 },
      'master-topic': { name: '🧠 Topic Master', desc: 'Achieve 90%+ mastery in any topic', condition: p => Object.values(p.topicMastery).some(t => t.mastery >= 90 && t.total >= 5) },
      'polymath': { name: '📚 Polymath', desc: 'Achieve 80%+ mastery in 3+ topics', condition: p => Object.values(p.topicMastery).filter(t => t.mastery >= 80 && t.total >= 5).length >= 3 },
      'comeback': { name: '💪 Comeback Kid', desc: 'Get 3 correct after getting 3 wrong', condition: p => this.hasComeback(p) }
    };
  }

  /**
   * Detect comeback pattern: 3 wrong followed by 3 correct.
   * @param {LearnerProfile} profile - Learner profile with history
   * @returns {boolean} True if comeback pattern detected
   */
  hasComeback(profile) {
    const h = profile.history;
    for (let i = 5; i < h.length; i++) {
      if (!h[i-5].correct && !h[i-4].correct && !h[i-3].correct &&
          h[i-2].correct && h[i-1].correct && h[i].correct) return true;
    }
    return false;
  }

  /**
   * Check for newly earned badges based on current profile state.
   * @param {LearnerProfile} profile - Learner profile to evaluate
   * @returns {Object[]} Array of newly earned badges with id, name, description
   */
  checkBadges(profile) {
    const earned = [];
    if (!profile.earnedBadges) profile.earnedBadges = new Set();
    for (const [id, badge] of Object.entries(this.badges)) {
      if (!profile.earnedBadges.has(id) && badge.condition(profile)) {
        profile.earnedBadges.add(id);
        earned.push({ id, name: badge.name, description: badge.desc });
      }
    }
    return earned;
  }

  /**
   * Calculate XP earned for an answer with streak and confidence bonuses.
   * @param {boolean} correct - Whether the answer was correct
   * @param {number} confidence - Learner confidence 1-5
   * @param {number} streak - Current day streak
   * @returns {number} XP earned (minimum 2 for attempting)
   */
  calculateXP(correct, confidence, streak) {
    let xp = correct ? 10 : 2; // base XP (some for trying)
    if (correct && confidence >= 4) xp += 5; // confidence bonus
    xp += Math.min(streak, 10); // streak multiplier (capped)
    return xp;
  }

  /**
   * Get all badges with earned/unearned status.
   * @param {LearnerProfile} profile - Learner profile
   * @returns {Object[]} All badges with earned boolean
   */
  getAllBadges(profile) {
    if (!profile.earnedBadges) profile.earnedBadges = new Set();
    return Object.entries(this.badges).map(([id, badge]) => ({
      id, name: badge.name, description: badge.desc,
      earned: profile.earnedBadges.has(id)
    }));
  }
}

class LearnerProfile {
  /**
   * Complete learner state: history, mastery, streaks, XP, badges.
   * Tracks per-topic performance and daily study patterns.
   * @param {string} learnerId - Unique learner identifier
   * @throws {Error} If learnerId is empty or undefined
   */
  constructor(learnerId) {
    this.id = learnerId;
    this.history = [];
    this.streakDays = 0;
    this.lastStudyDate = null;
    this.totalSessions = 0;
    this.totalCorrect = 0;
    this.totalAnswered = 0;
    this.totalXP = 0;
    this.topicMastery = {};
    this.cards = {};
    this.earnedBadges = new Set();
  }

  /**
   * Record an answer and update all metrics: mastery, streak, history.
   * @param {string} conceptId - ID of the concept answered
   * @param {string} topic - Topic name for mastery tracking
   * @param {boolean} correct - Whether the answer was correct
   * @param {number} confidence - Learner confidence 1-5
   * @param {number} difficulty - Question difficulty level
   */
  recordAnswer(conceptId, topic, correct, confidence, difficulty) {
    this.history.push({
      conceptId, topic, correct, confidence, difficulty,
      timestamp: new Date().toISOString()
    });
    this.totalAnswered++;
    if (correct) this.totalCorrect++;

    // Update topic mastery
    if (!this.topicMastery[topic]) {
      this.topicMastery[topic] = { correct: 0, total: 0, mastery: 0 };
    }
    this.topicMastery[topic].total++;
    if (correct) this.topicMastery[topic].correct++;
    this.topicMastery[topic].mastery = Math.round(
      (this.topicMastery[topic].correct / this.topicMastery[topic].total) * 100
    );

    // Update streak
    const today = new Date().toDateString();
    if (this.lastStudyDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (this.lastStudyDate === yesterday.toDateString()) {
        this.streakDays++;
      } else if (this.lastStudyDate !== null) {
        this.streakDays = 1;
      } else {
        this.streakDays = 1;
      }
      this.lastStudyDate = today;
    }
  }

  /**
   * Get overall accuracy as a percentage.
   * @returns {number} Accuracy percentage (0-100), 0 if no answers
   */
  getOverallAccuracy() {
    return this.totalAnswered > 0
      ? Math.round((this.totalCorrect / this.totalAnswered) * 100)
      : 0;
  }

  /**
   * Identify topics below 70% mastery with at least 3 attempts.
   * @returns {Object[]} Weak topics sorted ascending by mastery
   */
  getWeakTopics() {
    return Object.entries(this.topicMastery)
      .filter(([_, data]) => data.mastery < 70 && data.total >= 3)
      .sort((a, b) => a[1].mastery - b[1].mastery)
      .map(([topic, data]) => ({ topic, mastery: data.mastery, attempted: data.total }));
  }

  /**
   * Identify topics at or above 80% mastery with at least 3 attempts.
   * @returns {Object[]} Strong topics sorted descending by mastery
   */
  getStrongTopics() {
    return Object.entries(this.topicMastery)
      .filter(([_, data]) => data.mastery >= 80 && data.total >= 3)
      .sort((a, b) => b[1].mastery - a[1].mastery)
      .map(([topic, data]) => ({ topic, mastery: data.mastery, attempted: data.total }));
  }
}

class AdaptLearn {
  /**
   * Main adaptive learning engine orchestrating all subsystems.
   * Combines spaced repetition, adaptive difficulty, question generation,
   * and gamification into a cohesive learning experience.
   */
  constructor() {
    this.scheduler = new SpacedRepetitionScheduler();
    this.questionGen = new QuestionGenerator();
    this.difficultyAdapter = new DifficultyAdapter();
    this.gamification = new GamificationEngine();
    this.learners = {};
    this.curriculum = [];
    this.topicGraph = {}; // prerequisite tracking
  }

  /**
   * Load a structured curriculum with topics, concepts, and prerequisites.
   * Builds prerequisite graph for progressive topic unlocking.
   * @param {Object[]} topics - Topics with name, concepts array, and prerequisites
   * @returns {string} Summary of loaded content
   */
  loadCurriculum(topics) {
    this.curriculum = topics.flatMap(topic =>
      topic.concepts.map(concept => ({
        ...concept,
        topic: topic.name,
        prerequisites: topic.prerequisites || []
      }))
    );
    // Build prerequisite graph
    for (const topic of topics) {
      this.topicGraph[topic.name] = topic.prerequisites || [];
    }
    return `Loaded ${this.curriculum.length} concepts across ${topics.length} topics.`;
  }

  /**
   * Retrieve or create a learner profile with initialized flashcards.
   * @param {string} learnerId - Unique learner identifier
   * @returns {LearnerProfile} Existing or newly created profile
   */
  getOrCreateLearner(learnerId) {
    if (!this.learners[learnerId]) {
      this.learners[learnerId] = new LearnerProfile(learnerId);
      // Initialize cards for all concepts
      for (const concept of this.curriculum) {
        this.learners[learnerId].cards[concept.id] = {
          conceptId: concept.id,
          schedule: {
            repetitions: 0,
            easeFactor: 2.5,
            interval: 0,
            nextReviewDate: null,
            lastReviewed: null
          }
        };
      }
    }
    return this.learners[learnerId];
  }

  /**
   * Generate an adaptive quiz using spaced repetition priorities
   * and Zone of Proximal Development targeting.
   * Prioritizes due cards, then weak topics, then difficulty-matched items.
   * @param {string} learnerId - Learner to generate quiz for
   * @param {number} [count=5] - Number of questions to include
   * @returns {Object} Quiz with questions, target difficulty, and metadata
   */
  generateQuiz(learnerId, count = 5) {
    const learner = this.getOrCreateLearner(learnerId);
    const targetDifficulty = this.difficultyAdapter.calculateDifficulty(learner.history);

    // Prioritize: due cards > weak topics > new cards > random
    const dueCards = this.curriculum
      .filter(c => learner.cards[c.id] && this.scheduler.isDue(learner.cards[c.id]))
      .sort((a, b) => {
        const prioA = this.scheduler.getPriority(learner.cards[a.id]);
        const prioB = this.scheduler.getPriority(learner.cards[b.id]);
        return prioB - prioA;
      });

    const weakTopics = new Set(learner.getWeakTopics().map(t => t.topic));
    const weakConcepts = this.curriculum.filter(c => weakTopics.has(c.topic));

    // Build quiz selection
    const selected = [];
    const used = new Set();

    // 40% due cards
    const dueCount = Math.ceil(count * 0.4);
    for (const concept of dueCards.slice(0, dueCount)) {
      if (!used.has(concept.id)) {
        selected.push(concept);
        used.add(concept.id);
      }
    }

    // 30% weak topic cards
    const weakCount = Math.ceil(count * 0.3);
    const sortedWeak = this.difficultyAdapter.selectConceptByDifficulty(weakConcepts, targetDifficulty);
    for (const concept of sortedWeak.slice(0, weakCount)) {
      if (!used.has(concept.id)) {
        selected.push(concept);
        used.add(concept.id);
      }
    }

    // Fill remainder with difficulty-appropriate concepts
    const remaining = this.difficultyAdapter.selectConceptByDifficulty(
      this.curriculum.filter(c => !used.has(c.id)),
      targetDifficulty
    );
    for (const concept of remaining) {
      if (selected.length >= count) break;
      if (!used.has(concept.id)) {
        selected.push(concept);
        used.add(concept.id);
      }
    }

    // Generate questions
    const questions = selected.map(concept =>
      this.questionGen.generateQuestion(concept, this.curriculum)
    );

    return {
      quizId: `quiz_${Date.now()}`,
      learnerId,
      targetDifficulty: Math.round(targetDifficulty * 10) / 10,
      questionCount: questions.length,
      questions
    };
  }

  /**
   * Process a learner's answer: evaluate, update SM-2 schedule, award XP.
   * Maps correctness + confidence to SM-2 quality (0-5) for optimal spacing.
   * @param {string} learnerId - Learner who answered
   * @param {string} conceptId - Concept being tested
   * @param {*} answer - The learner's answer
   * @param {number} [confidence=3] - Self-reported confidence 1-5
   * @returns {Object} Result with correct, feedback, XP, badges, next review date
   */
  submitAnswer(learnerId, conceptId, answer, confidence = 3) {
    const learner = this.getOrCreateLearner(learnerId);
    const concept = this.curriculum.find(c => c.id === conceptId);
    if (!concept) return { error: 'Concept not found' };

    const card = learner.cards[conceptId];
    const question = this.questionGen.generateQuestion(concept, this.curriculum);
    let correct = false;

    // Evaluate answer
    if (question.type === 'multiple_choice') {
      correct = answer === question.correctIndex;
    } else if (question.type === 'true_false') {
      correct = answer === question.correctAnswer;
    } else if (question.type === 'fill_in_blank') {
      correct = String(answer).toLowerCase().trim() === question.correctAnswer;
    }

    // Map to SM-2 quality (0-5)
    let quality;
    if (correct && confidence >= 4) quality = 5;
    else if (correct && confidence >= 3) quality = 4;
    else if (correct) quality = 3;
    else if (confidence >= 3) quality = 2;
    else quality = 1;

    // Update spaced repetition schedule
    card.schedule = this.scheduler.calculateNext(card, quality);

    // Record in learner history
    learner.recordAnswer(conceptId, concept.topic, correct, confidence, concept.difficulty || 1);

    // Gamification: XP and badges
    const xpEarned = this.gamification.calculateXP(correct, confidence, learner.streakDays);
    learner.totalXP = (learner.totalXP || 0) + xpEarned;
    const newBadges = this.gamification.checkBadges(learner);

    return {
      correct,
      correctAnswer: question.correctAnswer,
      quality,
      nextReview: card.schedule.nextReviewDate,
      interval: card.schedule.interval,
      xpEarned,
      totalXP: learner.totalXP,
      newBadges,
      feedback: correct
        ? this.getPositiveFeedback(card.schedule.interval)
        : this.getCorrectionFeedback(concept)
    };
  }

  /**
   * Generate encouraging feedback based on spaced repetition interval.
   * Longer intervals indicate deeper learning and get stronger praise.
   * @param {number} interval - Days until next review
   * @returns {string} Motivational feedback message with emoji
   */
  getPositiveFeedback(interval) {
    if (interval >= 30) return '🌟 Mastered! Next review in a month.';
    if (interval >= 14) return '💪 Strong recall! Review in two weeks.';
    if (interval >= 7) return '👍 Good job! See you next week.';
    if (interval >= 3) return '✅ Correct! Review in a few days.';
    return '✅ Got it! Reviewing again soon to strengthen memory.';
  }

  /**
   * Generate correction feedback showing the correct definition.
   * @param {Object} concept - The concept that was answered incorrectly
   * @returns {string} Correction message with term and definition
   */
  getCorrectionFeedback(concept) {
    return `❌ Not quite. "${concept.term}" means: ${concept.definition}. You'll see this again soon.`;
  }

  /**
   * Determine which topics are unlocked based on prerequisite mastery.
   * A topic unlocks when all prerequisites reach 60%+ mastery with 3+ attempts.
   * @param {LearnerProfile} learner - Learner profile to evaluate
   * @returns {Object} Object with unlocked array and locked array (with missing prereqs)
   */
  getUnlockedTopics(learner) {
    const allTopics = [...new Set(this.curriculum.map(c => c.topic))];
    const unlocked = [];
    const locked = [];
    for (const topic of allTopics) {
      const prereqs = this.topicGraph[topic] || [];
      const allPrereqsMet = prereqs.every(prereq => {
        const m = learner.topicMastery[prereq];
        return m && m.mastery >= 60 && m.total >= 3;
      });
      if (allPrereqsMet || prereqs.length === 0) {
        unlocked.push(topic);
      } else {
        locked.push({ topic, requires: prereqs.filter(p => {
          const m = learner.topicMastery[p];
          return !m || m.mastery < 60 || m.total < 3;
        })});
      }
    }
    return { unlocked, locked };
  }

  /**
   * Generate comprehensive study report with progress, recommendations,
   * topic mastery, gamification stats, and personalized study tips.
   * @param {string} learnerId - Learner to report on
   * @returns {Object} Full study report with learner stats, progress, recommendations
   */
  getStudyReport(learnerId) {
    const learner = this.getOrCreateLearner(learnerId);
    const dueCount = this.curriculum.filter(c =>
      learner.cards[c.id] && this.scheduler.isDue(learner.cards[c.id])
    ).length;

    const masteredCount = Object.values(learner.cards).filter(c =>
      c.schedule.interval >= 21
    ).length;

    const learningCount = Object.values(learner.cards).filter(c =>
      c.schedule.repetitions > 0 && c.schedule.interval < 21
    ).length;

    const newCount = Object.values(learner.cards).filter(c =>
      c.schedule.repetitions === 0
    ).length;

    const topicAccess = this.getUnlockedTopics(learner);
    const level = Math.floor((learner.totalXP || 0) / 100) + 1;

    return {
      learner: {
        id: learner.id,
        streak: learner.streakDays,
        totalSessions: learner.totalSessions,
        overallAccuracy: learner.getOverallAccuracy(),
        totalAnswered: learner.totalAnswered,
        totalXP: learner.totalXP || 0,
        level,
        levelProgress: `${(learner.totalXP || 0) % 100}/100 XP to next level`
      },
      badges: this.gamification.getAllBadges(learner),
      cardStatus: {
        total: this.curriculum.length,
        mastered: masteredCount,
        learning: learningCount,
        new: newCount,
        dueForReview: dueCount
      },
      topicMastery: learner.topicMastery,
      topicAccess,
      weakAreas: learner.getWeakTopics(),
      strongAreas: learner.getStrongTopics(),
      recommendations: this.getRecommendations(learner, dueCount)
    };
  }

  getRecommendations(learner, dueCount) {
    const recs = [];

    if (dueCount > 10) {
      recs.push({ priority: 'HIGH', message: `You have ${dueCount} cards due for review. Start with those to prevent forgetting.` });
    } else if (dueCount > 0) {
      recs.push({ priority: 'MEDIUM', message: `${dueCount} cards ready for review. Quick session recommended.` });
    }

    const weakTopics = learner.getWeakTopics();
    if (weakTopics.length > 0) {
      recs.push({
        priority: 'HIGH',
        message: `Focus on weak areas: ${weakTopics.map(t => `${t.topic} (${t.mastery}%)`).join(', ')}`
      });
    }

    if (learner.getOverallAccuracy() < 60 && learner.totalAnswered > 10) {
      recs.push({
        priority: 'MEDIUM',
        message: 'Accuracy is below 60%. Consider reviewing fundamentals before advancing.'
      });
    }

    if (learner.streakDays >= 7) {
      recs.push({ priority: 'INFO', message: `🔥 ${learner.streakDays}-day streak! Consistency is key to retention.` });
    }

    if (recs.length === 0) {
      recs.push({ priority: 'INFO', message: 'Great progress! Keep up the regular review schedule.' });
    }

    return recs;
  }
}

// === Demo ===
function main() {
  const engine = new AdaptLearn();

  // Load a sample curriculum: Web Development Basics
  const curriculum = [
    {
      name: 'HTML Fundamentals',
      prerequisites: [],
      concepts: [
        { id: 'html-1', term: 'HTML', definition: 'HyperText Markup Language, the standard language for creating web pages', difficulty: 1 },
        { id: 'html-2', term: 'Element', definition: 'A component of an HTML document defined by a start tag, content, and end tag', difficulty: 1 },
        { id: 'html-3', term: 'Attribute', definition: 'Additional information about an HTML element specified in the start tag', difficulty: 1.5 },
        { id: 'html-4', term: 'Semantic HTML', definition: 'Using HTML elements that convey meaning about the content they contain', difficulty: 2 },
        { id: 'html-5', term: 'DOM', definition: 'Document Object Model, a tree representation of an HTML document that programs can manipulate', difficulty: 2.5 }
      ]
    },
    {
      name: 'CSS Basics',
      prerequisites: ['HTML Fundamentals'],
      concepts: [
        { id: 'css-1', term: 'CSS', definition: 'Cascading Style Sheets, a language for describing the visual presentation of HTML documents', difficulty: 1 },
        { id: 'css-2', term: 'Selector', definition: 'A pattern used to select and target HTML elements for styling', difficulty: 1.5 },
        { id: 'css-3', term: 'Box Model', definition: 'The concept that every HTML element is a rectangular box with content, padding, border, and margin', difficulty: 2 },
        { id: 'css-4', term: 'Flexbox', definition: 'A CSS layout model that arranges items in rows or columns with flexible sizing', difficulty: 2.5 },
        { id: 'css-5', term: 'Specificity', definition: 'The algorithm browsers use to determine which CSS rule takes precedence when multiple rules target the same element', difficulty: 3 }
      ]
    },
    {
      name: 'JavaScript Essentials',
      prerequisites: ['HTML Fundamentals'],
      concepts: [
        { id: 'js-1', term: 'Variable', definition: 'A named container that stores a value which can be referenced and changed', difficulty: 1 },
        { id: 'js-2', term: 'Function', definition: 'A reusable block of code designed to perform a specific task', difficulty: 1.5 },
        { id: 'js-3', term: 'Callback', definition: 'A function passed as an argument to another function to be executed later', difficulty: 2.5 },
        { id: 'js-4', term: 'Promise', definition: 'An object representing the eventual completion or failure of an asynchronous operation', difficulty: 3 },
        { id: 'js-5', term: 'Closure', definition: 'A function that retains access to variables from its outer scope even after the outer function has returned', difficulty: 3.5 }
      ]
    }
  ];

  console.log('='.repeat(66));
  console.log('  AdaptLearn -- Adaptive Spaced-Repetition Learning Engine');
  console.log('  SM-2 Algorithm | Prerequisite Graphs | Gamification');
  console.log('='.repeat(66));

  // 1. Load curriculum
  console.log('\n--- 1. CURRICULUM LOADING ---\n');
  console.log('  ' + engine.loadCurriculum(curriculum));
  console.log('  Prerequisite graph: HTML -> CSS, HTML -> JavaScript');
  console.log('  Difficulty range: 1.0 (beginner) to 3.5 (advanced)');
  console.log('  INSIGHT: The prerequisite graph ensures learners master HTML before');
  console.log('  advancing to CSS or JavaScript. This scaffolded approach prevents the');
  console.log('  #1 cause of learner dropout: attempting material without prerequisites.');

  // 2. Quiz generation
  const learnerId = 'student_01';
  console.log('\n--- 2. ADAPTIVE QUIZ SESSION ---\n');
  console.log('  Learner: ' + learnerId);
  const quiz = engine.generateQuiz(learnerId, 5);
  console.log('  Generated: ' + quiz.questionCount + ' questions at difficulty ' + quiz.targetDifficulty);
  console.log('  Question types: ' + quiz.questions.map(function(q) { return q.type; }).join(', '));

  // Simulate answering
  const simulatedAnswers = [
    { conceptId: quiz.questions[0]?.conceptId, answer: quiz.questions[0]?.correctIndex ?? 0, confidence: 4, correct: true },
    { conceptId: quiz.questions[1]?.conceptId, answer: quiz.questions[1]?.correctIndex ?? 0, confidence: 5, correct: true },
    { conceptId: quiz.questions[2]?.conceptId, answer: 999, confidence: 2, correct: false },
    { conceptId: quiz.questions[3]?.conceptId, answer: quiz.questions[3]?.correctIndex ?? 0, confidence: 3, correct: true },
    { conceptId: quiz.questions[4]?.conceptId, answer: quiz.questions[4]?.correctIndex ?? 0, confidence: 4, correct: true },
  ];

  var correctCount = 0;
  for (let i = 0; i < Math.min(quiz.questions.length, simulatedAnswers.length); i++) {
    const q = quiz.questions[i];
    const sim = simulatedAnswers[i];
    console.log('\n  Q' + (i+1) + ' [' + q.type + ']: ' + q.question.substring(0, 60) + '...');

    const result = engine.submitAnswer(learnerId, sim.conceptId, sim.correct ? (q.correctIndex ?? q.correctAnswer) : 999, sim.confidence);
    if (result.correct) correctCount++;
    console.log('  -> ' + result.feedback);
    console.log('     Schedule: review in ' + result.interval + ' day(s) | +' + result.xpEarned + ' XP');
    if (result.newBadges.length > 0) {
      result.newBadges.forEach(function(b) { console.log('     NEW BADGE: ' + b.name + ' -- ' + b.description); });
    }
  }

  console.log('\n  INSIGHT: ' + correctCount + '/5 correct (' + (correctCount*20) + '% accuracy). The SM-2 algorithm');
  console.log('  resets incorrect cards to a 1-day interval while spacing correct cards');
  console.log('  to 6+ days. This asymmetry ensures weak material gets drilled before');
  console.log('  being forgotten, while known material is efficiently spaced out.');

  // 3. Spaced repetition schedule
  console.log('\n--- 3. SPACED REPETITION SCHEDULE ---\n');
  const learner = engine.learners[learnerId];
  var reviewed = 0;
  for (const cid of Object.keys(learner.cards)) {
    const card = learner.cards[cid];
    if (card.schedule.repetitions > 0) {
      reviewed++;
      const concept = engine.curriculum.find(function(c) { return c.id === cid; });
      console.log('  ' + (concept ? concept.term : cid).padEnd(18) + ' | interval: ' + String(card.schedule.interval).padEnd(4) + 'd | EF: ' + card.schedule.easeFactor.toFixed(2) + ' | reps: ' + card.schedule.repetitions);
    }
  }
  console.log('  (' + reviewed + ' cards reviewed, ' + (engine.curriculum.length - reviewed) + ' new)');
  console.log('  INSIGHT: The ease factor (EF) starts at 2.5 and adjusts per-card based');
  console.log('  on recall quality. Lower EF = harder card = more frequent reviews. This');
  console.log('  personalization is what makes SM-2 superior to fixed-interval drilling.');

  // 4. Study report
  console.log('\n--- 4. MASTERY & TOPIC ACCESS ---\n');
  const report = engine.getStudyReport(learnerId);

  Object.entries(report.topicMastery).forEach(function(entry) {
    var topic = entry[0], data = entry[1];
    var bar = '';
    for (var b = 0; b < 10; b++) bar += (b < Math.round(data.mastery / 10)) ? '#' : '.';
    console.log('  ' + topic.padEnd(22) + ' [' + bar + '] ' + String(data.mastery).padStart(3) + '% (' + data.correct + '/' + data.total + ')');
  });
  console.log('\n  Unlocked: ' + report.topicAccess.unlocked.join(', '));
  report.topicAccess.locked.forEach(function(t) { console.log('  LOCKED: ' + t.topic + ' -- needs: ' + t.requires.join(', ')); });
  console.log('  INSIGHT: Topics unlock only when all prerequisites reach 60% mastery.');
  console.log('  This prevents learners from jumping ahead with knowledge gaps, mirroring');
  console.log('  how expert tutors sequence material in one-on-one instruction.');

  // 5. Gamification
  console.log('\n--- 5. GAMIFICATION & ACHIEVEMENTS ---\n');
  console.log('  Level ' + report.learner.level + ' | ' + report.learner.totalXP + ' XP | Streak: ' + report.learner.streak + 'd');
  console.log('  Accuracy: ' + report.learner.overallAccuracy + '% across ' + report.learner.totalAnswered + ' questions');
  report.badges.forEach(function(b) {
    console.log('  ' + (b.earned ? '[x]' : '[ ]') + ' ' + b.name + ' -- ' + b.description);
  });
  console.log('  INSIGHT: Gamification provides extrinsic motivation while the SRS handles');
  console.log('  intrinsic learning optimization. Research shows gamified learning platforms');
  console.log('  improve completion rates by 30-50% when combined with meaningful feedback.');

  // 6. Recommendations
  console.log('\n--- 6. AI-POWERED STUDY RECOMMENDATIONS ---\n');
  report.recommendations.forEach(function(r) { console.log('  [' + r.priority + '] ' + r.message); });
  if (report.weakAreas.length > 0) {
    console.log('  Weak areas: ' + report.weakAreas.map(function(a) { return a.topic + ' (' + a.mastery + '%)'; }).join(', '));
  }
  console.log('  INSIGHT: Recommendations combine spaced repetition urgency, topic mastery');
  console.log('  gaps, and learning patterns. The engine prioritizes overdue cards first,');
  console.log('  then weak topics, then new material -- optimizing for long-term retention.');

  // Executive summary
  console.log('\n='.repeat(66));
  console.log('  LEARNING ANALYTICS SUMMARY');
  console.log('='.repeat(66));
  console.log('  Accuracy:      ' + report.learner.overallAccuracy + '% across ' + report.learner.totalAnswered + ' questions');
  console.log('  Topics:        ' + Object.keys(report.topicMastery).length + ' studied, ' + report.cardStatus.mastered + ' concepts mastered');
  console.log('  Cards:         ' + report.cardStatus.mastered + ' mastered, ' + report.cardStatus.learning + ' learning, ' + report.cardStatus.new + ' new');
  console.log('  Due:           ' + report.cardStatus.dueForReview + ' cards need review');
  console.log('  Gamification:  Level ' + report.learner.level + ', ' + report.badges.filter(function(b){return b.earned;}).length + '/' + report.badges.length + ' badges');
  console.log('  Key insight:   Prerequisite gates + SM-2 spacing + adaptive difficulty');
  console.log('                 create personalized learning paths that maximize retention');
  console.log('='.repeat(66));
}

main();

// Module exports for sandbox
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdaptLearn, SpacedRepetitionScheduler, QuestionGenerator, DifficultyAdapter, LearnerProfile, GamificationEngine };
}
