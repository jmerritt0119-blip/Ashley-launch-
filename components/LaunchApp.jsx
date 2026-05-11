import React, { useState, useEffect } from 'react';
import { Home, BookOpen, ClipboardCheck, DollarSign, User, ChevronRight, Check, X, ArrowLeft, Award, Lock, Sparkles, TrendingUp, Settings, Shield, Heart, FileText, Users, Calculator, Bed, Target, Zap, MessageCircle, Eye, Clock as ClockIcon } from 'lucide-react';

// ===== EXTERNAL LINKS =====
const CALC_URL = 'https://ephemeral-smakager-4f33f0.netlify.app';
const DISCOVERY_URL = 'https://vt.lightspeedvt.com/trainingCenter/scorm/215478/course?parentCat=41680,41683';

// ===== BRAND =====
const ORANGE = '#F37520';
const ORANGE_DARK = '#D85F12';
const ORANGE_TINT = '#FBE8DA';
const DARK = '#1F1F1F';
const MID = '#595959';
const SOFT = '#FAF8F5';
const LIGHT_BG = '#F4F1ED';
const GREEN = '#5A8F5A';
const RED = '#C44';
const BORDER = '#E8E5E0';
// iOS-ish neutrals
const IOS_BG = '#F2F2F7';        // systemGroupedBackground
const IOS_HAIRLINE = 'rgba(60,60,67,0.18)';
const IOS_LABEL_2 = 'rgba(60,60,67,0.62)';
const IOS_LABEL_3 = 'rgba(60,60,67,0.30)';
const CARD_SHADOW = '0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)';

// ===== MONEY HELPERS =====
// Always round to nearest $9.99 (values: 99.99, 109.99, 119.99, 129.99...)
const ROUND_999 = (val) => Math.round(val / 10) * 10 - 0.01;

// SafeLock pricing — single source of truth
const SAFELOCK_PRICE = (preTax) => {
  if (preTax <= 800) return 99.99;
  if (preTax <= 1200) return 169.99;
  return ROUND_999(preTax * 0.14);
};

const FMT_MONEY = (v) => '$' + Math.round(v).toLocaleString();
const FMT_MONEY_K = (v) => v >= 1000 ? '$' + (v/1000).toFixed(0) + 'K' : '$' + Math.round(v);

// ===== COMMISSION RATE LADDER =====
// rateTier 0 = Standard, 1 = Year 1 MDC ($1M hit), 2 = Year 2 MDC, 3 = Y3, 4 = Y4
const RATE_LADDER = [
  { label: 'Standard', furniture: 0.05, safelock: 0.20 },
  { label: 'Year 1 MDC ($1M)', furniture: 0.055, safelock: 0.225 },
  { label: 'Year 2 MDC (+grow)', furniture: 0.06, safelock: 0.25 },
  { label: 'Year 3 MDC (+grow)', furniture: 0.065, safelock: 0.275 },
  { label: 'Year 4 MDC (+grow)', furniture: 0.07, safelock: 0.30 },
];

// ===== BONUS TIERS =====
const VOLUME_TIERS = [
  { min: 250000, bonus: 1000, label: '$250K' },
  { min: 275000, bonus: 1500, label: '$275K' },
  { min: 300000, bonus: 2500, label: '$300K' },
];
const BEDDING_TIERS = [
  { min: 50000, bonus: 500, label: '$50K' },
  { min: 75000, bonus: 1000, label: '$75K' },
  { min: 100000, bonus: 2000, label: '$100K' },
];
const SAFELOCK_TIERS = [
  { min: 8.0, bonus: 500, label: '8.0%' },
  { min: 8.5, bonus: 750, label: '8.5%' },
  { min: 9.5, bonus: 1250, label: '9.5%' },
];
const DELIVERY_TIERS = [
  { min: 5.0, bonus: 100, label: '5.0%' },
  { min: 5.75, bonus: 250, label: '5.75%' },
  { min: 6.5, bonus: 500, label: '6.5%' },
];
const SAFELOCK_MIN = 20000;   // floor to qualify for SafeLock bonus
const DELIVERY_MIN = 12500;    // floor to qualify for Delivery bonus
const MARGIN_MIN = 53;
const HOURS_MIN = 520;
const RT_MIN = 91;

// ===== SCHEDULES =====
const schedules = {
  1: {
    title: 'Foundation',
    step: 'ENGAGE',
    blocks: [
      { time: '9:30', end: '10:00', block: 'Welcome & Pre-Training Assessment', detail: 'Meet the team. Sign Hygiene & Dress Code. Quick self-rating.', cheatId: 'hygiene' },
      { time: '10:00', end: '10:30', block: 'What We Believe', detail: 'Vision, Mission, Core Beliefs.', cheatId: 'beliefs' },
      { time: '10:30', end: '11:30', block: 'Pay & Bonus Structure', detail: 'KPIs, four bonus tiers, Million Dollar Writer.', cheatId: 'earnings' },
      { time: '11:30', end: '12:30', block: 'Lunch', detail: 'Eat. Reset.', cheatId: null },
      { time: '12:30', end: '2:30', block: 'Ashley Discovery: EASY Course', detail: 'The official Ashley course — all 4 steps. Watched on the clock.', cheatId: null, courseLink: true },
      { time: '2:30', end: '3:00', block: 'Course Debrief', detail: 'Q&A on the EASY framework. Key takeaways.', cheatId: 'master' },
      { time: '3:00', end: '3:30', block: 'Product First Look', detail: 'Floor walk. Major categories.', cheatId: null },
      { time: '3:30', end: '4:00', block: 'ENGAGE Deep Dive', detail: 'Non-Business Greeting. QAS. Reading Regard.', cheatId: 'engage' },
      { time: '4:00', end: '4:30', block: 'ENGAGE Drill', detail: 'Stacked roleplay rounds.', cheatId: 'engage' },
      { time: '4:30', end: '5:00', block: 'Day 1 Quiz', detail: '30 questions.', cheatId: null, isQuiz: 1 },
    ]
  },
  2: {
    title: 'Discovery',
    step: 'ASK & LISTEN',
    blocks: [
      { time: '9:30', end: '10:00', block: 'Day 1 Recap', detail: 'ENGAGE drill warm-up. Quiz score review.', cheatId: null },
      { time: '10:00', end: '10:30', block: 'A&L Overview', detail: 'The 5 Whats. Why questioning is the highest leverage skill.', cheatId: 'ask' },
      { time: '10:30', end: '11:30', block: 'Discovery Mastery', detail: 'Open vs. closed. Question bank. Active listening.', cheatId: 'ask' },
      { time: '11:30', end: '12:30', block: 'Reading the Ashley Tag', detail: 'SRP, model numbers, prefixes.', cheatId: null },
      { time: '12:30', end: '1:30', block: 'Lunch', detail: 'Eat. Reset.', cheatId: null },
      { time: '1:30', end: '2:30', block: 'Furniture Math', detail: 'Tax, discounts, SafeLock, OTD pricing.', cheatId: null },
      { time: '2:30', end: '3:30', block: 'Affordability Calculator', detail: 'Hands-on. Build practice quotes.', cheatId: 'calc' },
      { time: '3:30', end: '4:30', block: 'A&L Drill (stacked)', detail: 'ENGAGE → ASK & LISTEN. 8 scenarios.', cheatId: 'ask' },
      { time: '4:30', end: '5:00', block: 'Day 2 Quiz', detail: '20 questions.', cheatId: null, isQuiz: 2 },
    ]
  },
  3: {
    title: 'Presentation',
    step: 'SHOW & SOLVE',
    blocks: [
      { time: '9:30', end: '10:00', block: 'Day 2 Recap', detail: 'ENGAGE + A&L drill warm-up.', cheatId: null },
      { time: '10:00', end: '10:45', block: 'SHOW & SOLVE Overview', detail: 'Feature → Benefit → Bridge framework.', cheatId: 'show' },
      { time: '10:45', end: '11:30', block: 'The Ashley Story', detail: 'The narrative for Low Regard openers and Support bridges.', cheatId: 'ashleystory' },
      { time: '11:30', end: '12:00', block: 'Manager\'s Introduction', detail: 'When and how to bring the manager into the sale.', cheatId: 'managerintro' },
      { time: '12:00', end: '1:00', block: 'Lunch', detail: 'Eat. Reset.', cheatId: null },
      { time: '1:00', end: '2:00', block: 'Ashley Tools Walk', detail: 'Guest Experience Handout, Advantage Card, Healthy Sleep Flyer, Bedding Gallery.', cheatId: 'ashleytools' },
      { time: '2:00', end: '3:00', block: 'Story Selling Workshop', detail: 'Build your story library.', cheatId: 'show' },
      { time: '3:00', end: '4:00', block: 'S&S Drill (stacked)', detail: 'ENGAGE → A&L → SHOW & SOLVE.', cheatId: 'show' },
      { time: '4:00', end: '4:30', block: 'Two-Choice Show Practice', detail: 'Walking guests through 2-3 options.', cheatId: 'show' },
      { time: '4:30', end: '5:00', block: 'Day 3 Quiz', detail: '30 questions.', cheatId: null, isQuiz: 3 },
    ]
  },
  4: {
    title: 'Closing',
    step: 'YES',
    blocks: [
      { time: '9:30', end: '10:00', block: 'Day 3 Recap', detail: 'Stacked drill warm-up.', cheatId: null },
      { time: '10:00', end: '11:00', block: 'YES Overview + 8 Closes', detail: 'Trial closes, the ask, confirmation.', cheatId: 'yes' },
      { time: '11:00', end: '12:00', block: 'Objection Library', detail: 'The 12-15 most common — and what to say.', cheatId: 'objections' },
      { time: '12:00', end: '1:00', block: 'Lunch', detail: 'Eat. Reset.', cheatId: null },
      { time: '1:00', end: '2:00', block: 'Phone & Web Lead Handling', detail: 'Inbound calls, web inquiries, appointment-setting scripts.', cheatId: 'phoneleads' },
      { time: '2:00', end: '3:00', block: 'T-Charts Workshop', detail: 'Cash vs finance. Two-product. Today vs wait.', cheatId: 'tcharts' },
      { time: '3:00', end: '4:00', block: 'Full E.A.S.Y. Drill', detail: 'All 4 steps stacked end-to-end.', cheatId: 'yes' },
      { time: '4:00', end: '4:30', block: 'Objection Drill', detail: 'Trainer fires objections. Trainee responds in real time.', cheatId: 'objections' },
      { time: '4:30', end: '5:00', block: 'Day 4 Quiz', detail: '30 questions.', cheatId: null, isQuiz: 4 },
    ]
  },
  5: {
    title: 'System & Money',
    step: 'POS · FINANCE · ATTACH',
    blocks: [
      { time: '9:30', end: '10:00', block: 'Day 4 Recap', detail: 'Full E.A.S.Y. drill warm-up.', cheatId: null },
      { time: '10:00', end: '11:00', block: 'POS Walkthrough', detail: 'Order entry. Line items. Tags. Discounts.', cheatId: 'pos' },
      { time: '11:00', end: '12:00', block: 'Ticket Writing Practice', detail: 'Build real-style tickets — sofa group, bedroom set, bedding.', cheatId: 'pos' },
      { time: '12:00', end: '1:00', block: 'Lunch', detail: 'Eat. Reset.', cheatId: null },
      { time: '1:00', end: '2:00', block: 'Finance Partners Deep Dive', detail: 'Synchrony, Wells Fargo, Affirm — apps, terms, when each fits.', cheatId: 'calc' },
      { time: '2:00', end: '3:00', block: 'SafeLock Pitch Workshop', detail: 'Quick pitch. Objection handling. Attachment math.', cheatId: 'safelock' },
      { time: '3:00', end: '4:00', block: 'Delivery Pitch Workshop', detail: 'Why it matters. Monthly impact. Attachment %.', cheatId: 'delivery' },
      { time: '4:00', end: '4:30', block: 'Stacked Drill', detail: 'Full E.A.S.Y. + write the ticket + attach SafeLock + attach delivery.', cheatId: null },
      { time: '4:30', end: '5:00', block: 'Day 5 Quiz', detail: '30 questions.', cheatId: null, isQuiz: 5 },
    ]
  },
  6: {
    title: 'Specialization & Final Cert',
    step: 'BEDDING',
    blocks: [
      { time: '9:30', end: '10:00', block: 'Day 5 Recap', detail: 'POS + finance + attachment warm-up.', cheatId: null },
      { time: '10:00', end: '11:30', block: 'Bedding Foundations', detail: 'The full bedding flow. Reveal-store flow if applicable.', cheatId: 'bedding' },
      { time: '11:30', end: '12:30', block: 'Brand Walk', detail: 'Tempur-Pedic, Stearns, Beautyrest, Ashley Sleep, Purple, Nectar, Sealy.', cheatId: 'bedding' },
      { time: '12:30', end: '1:30', block: 'Lunch', detail: 'Eat. Reset.', cheatId: null },
      { time: '1:30', end: '2:30', block: 'Adjustable Base Demo Practice', detail: 'Demo the head, the feet, zero-gravity.', cheatId: 'bedding' },
      { time: '2:30', end: '3:00', block: 'Customer Service Basics', detail: 'Post-sale care. Returns. Service claims. The thank-you note.', cheatId: 'customerservice' },
      { time: '3:00', end: '3:45', block: 'Full Bedding Sale Roleplay', detail: 'Pillow through close. With base. With protection.', cheatId: 'bedding' },
      { time: '3:45', end: '4:00', block: 'Bedding Foundations Sign-Off', detail: 'Manager certification.', cheatId: 'beddingcert' },
      { time: '4:00', end: '5:00', block: 'Final Certification Exam', detail: '60 questions — cumulative across all 6 days.', cheatId: null, isQuiz: 6 },
    ]
  }
};

// ===== QUIZZES =====
const quizzes = {
  1: {
    name: 'Day 1: ENGAGE & E.A.S.Y. Overview',
    pass: 80,
    questions: [
      { q: 'What does E.A.S.Y. stand for?', choices: ['Engage, Ask & Listen, Show & Solve, YES', 'Explore, Ask, Sell, Yield', 'Engage, Analyze, Share, Yes', 'Examine, Assess, Solve, Yield'], correct: 0, explain: 'E.A.S.Y. = Engage, Ask & Listen, Show & Solve, YES.' },
      { q: 'What is the foundation of the ENGAGE step?', choices: ['A direct question about what the guest is shopping for', 'A Non-Business Greeting that does not discuss business', 'Pulling the Affordability Calculator', '"Can I help you find anything?"'], correct: 1, explain: 'ENGAGE leads with a Non-Business Greeting — a welcome or salutation that does NOT discuss business.' },
      { q: 'In the QAS Model, the SUPPORT step is for:', choices: ['Asking the guest about furniture', 'Closing the sale', 'Adding value or context that bridges the conversation forward', 'Quoting a price'], correct: 2, explain: 'Support adds value — additional context, insights, or info that moves the conversation forward.' },
      { q: 'A guest brushes you off with "I\'m just looking." This is which Regard level?', choices: ['HIGH Regard', 'LOW Regard', 'NO Regard', 'Cannot determine'], correct: 1, explain: 'LOW Regard guests are pleasant but hesitant. Use personality + ONE value-add.' },
      { q: 'How long should you wait before re-approaching a NO Regard guest?', choices: ['Immediately', '30 seconds', 'At least 2 minutes', 'Until they ask for help'], correct: 2, explain: 'Wait at least 2 minutes. Watch for the Window of Opportunity.' },
      { q: 'Which is a Window of Opportunity to re-engage?', choices: ['Guest is on their phone', 'Guest is checking out a price tag', 'Guest is talking to another guest', 'Guest is leaving the store'], correct: 1, explain: 'Price tag check, test-driving furniture, mechanism interaction, or looking for help — those are your moments.' },
      { q: 'Which of these is the WORST opener?', choices: ['"Welcome to Ashley! How\'s your day going?"', '"Beautiful weather we\'re having."', '"Can I help you?"', '"Hey, welcome in — love that hat."'], correct: 2, explain: '"Can I help you?" invites "No" 90% of the time. So does any business question.' },
      { q: 'What is the minimum written margin for ANY quarterly bonus?', choices: ['35%', '45%', '53%', '60%'], correct: 2, explain: '53% Written Margin (incl. delivery and Safelock) is the floor.' },
      { q: 'How many Rest Tests must you complete per quarter?', choices: ['50', '75', '91 (about 7 per week)', '120'], correct: 2, explain: '91 Rest Tests per quarter = 7 per week.' },
      { q: 'The first Volume Bonus tier ($1,000) is at what quarterly volume?', choices: ['$200,000', '$250,000', '$275,000', '$300,000'], correct: 1, explain: '$250K = $1,000. $275K = $1,500. $300K+ = $2,500.' },
      { q: 'The Bedding Bonus has a quarterly minimum of:', choices: ['$25,000', '$50,000', '$75,000', '$100,000'], correct: 1, explain: '$50,000 bedding minimum per quarter to qualify.' },
      { q: 'In the QAS Model, the QUESTION should be about:', choices: ['Furniture they need', 'Their budget', 'The person — weekend, weather, hobby', 'Financing options'], correct: 2, explain: 'QAS Questions are about the PERSON. Their answer is theirs. Your support bridges value.' },
      { q: 'What three things do you carry as ENGAGE hand-off materials?', choices: ['Receipt book and pen', 'Guest Experience Handout and Ashley Advantage Card', 'Calculator and tape measure', 'Catalog and price sheet'], correct: 1, explain: 'Guest Experience Handout + Ashley Advantage Card. Hand them off naturally during ENGAGE.' },
      { q: 'Which step focuses on uncovering the guest\'s real needs?', choices: ['Engage', 'Ask & Listen', 'Show & Solve', 'YES'], correct: 1, explain: 'ASK & LISTEN is where you uncover real needs.' },
      { q: 'The Million Dollar Writer threshold is:', choices: ['$500,000', '$750,000', '$1,000,000', '$1,250,000'], correct: 2, explain: '$1M crosses the Million Dollar Writer threshold — next year your commission rate climbs.' },
      { q: 'Which is NOT a Core Belief at this Ashley franchise?', choices: ['GOD', 'Dominate Our Market', 'Maximize Profit Above All', 'Locally Owned'], correct: 2, explain: 'Core Beliefs: GOD, Dominate Our Market, Locally Owned, People Buy From People, Social Responsibility, Team.' },
      { q: 'For a HIGH Regard guest, your strategy is to:', choices: ['Push them toward financing immediately', 'Use general conversation and QAS to learn about family and lifestyle', 'Let them shop alone', 'Skip ENGAGE and go straight to product'], correct: 1, explain: 'HIGH Regard = lean in. Use QAS to deepen connection. Learn about family and lifestyle.' },
      { q: 'For a LOW Regard guest, you offer ONE of these as value-adds:', choices: ['A price quote', 'Store layout, how to read a price tag, current promotion, or the Ashley story', 'A free dessert', 'Their measurements'], correct: 1, explain: 'Pick ONE: store layout, price tag, current promotion, or the Ashley story.' },
      { q: 'The Ashley sales target progression is:', choices: ['$0 → $500K → $1M', 'START $0 → GOOD $900K → GREAT $1.25M', '$0 → $1M → $2M', '$100K → $500K → $1M'], correct: 1, explain: 'Official Ashley progression: START $0 → GOOD $900,000 → GREAT $1.25M annually.' },
      { q: 'When you transition from ENGAGE to ASK & LISTEN, you should:', choices: ['Quote the guest a price', 'Ask probing questions to uncover needs and personal buying motivators', 'Show them the most expensive option first', 'Offer a discount'], correct: 1, explain: 'A&L is where probing questions surface needs and buying motivators.' }
    ]
  },
  2: {
    name: 'Day 2: ASK & LISTEN, Tags, Math, Calculator',
    pass: 80,
    questions: [
      { q: 'What is the primary goal of ASK & LISTEN?', choices: ['Explain financing', 'Uncover the guest\'s real need beyond what they say', 'Get to product fast', 'Find out budget first'], correct: 1, explain: 'Uncover the real need behind the surface request.' },
      { q: 'What are the 5 Whats?', choices: ['Price, color, size, brand, delivery', 'Room, use, timeframe, works/doesn\'t, budget signals', 'Wrong, right, next, price, warranty', 'Need, want, afford, buy, skip'], correct: 1, explain: 'Room, Use, Timeframe, Works/Doesn\'t, Budget Signals.' },
      { q: 'Which is an OPEN-ended discovery question?', choices: ['"Do you want leather or fabric?"', '"Is this for your living room?"', '"Tell me how you\'ll use this room."', '"Do you need it by Friday?"'], correct: 2, explain: 'Open questions invite a real answer, not yes/no.' },
      { q: 'After asking a discovery question, you should:', choices: ['Talk over them', 'Wait, repeat back, then dig the next layer', 'Quote a price right away', 'Move to product immediately'], correct: 1, explain: 'Wait → repeat back → dig next layer. Active listening cycle.' },
      { q: 'Why do we repeat back what the guest said?', choices: ['To prove we listened and confirm the need', 'To delay the sale', 'To pressure them', 'To stall'], correct: 0, explain: 'Repeating back confirms the need and proves you were listening.' },
      { q: 'On a casegood model B697-31, the "B" stands for:', choices: ['Brand', 'Bedroom', 'Best seller', 'Buyer'], correct: 1, explain: 'B = Bedroom in the casegood prefix system.' },
      { q: 'On upholstery model 255 00 38, the "00" represents:', choices: ['Piece type', 'Series', 'Color number', 'Fabric grade'], correct: 2, explain: 'Middle digits = color number on upholstery models.' },
      { q: 'Which prefix represents Mattresses (Ashley Sleep)?', choices: ['B', 'M', 'P', 'Q'], correct: 1, explain: 'M = Mattresses (Ashley Sleep).' },
      { q: 'What does APK mean?', choices: ['Annual Price Kit', 'A kit of components ordered together as one SKU', 'Ashley Premium Kit', 'Available Promotion Kit'], correct: 1, explain: 'APK = a kit of components ordered together as one SKU.' },
      { q: 'Subtotal $1,800. What is 8.25% sales tax?', choices: ['$148.50', '$135.00', '$162.00', '$180.00'], correct: 0, explain: '$1,800 × 0.0825 = $148.50.' },
      { q: 'Subtotal $2,400 with 10% discount. New subtotal?', choices: ['$2,160', '$2,200', '$2,150', '$2,260'], correct: 0, explain: '$2,400 × 0.90 = $2,160.' },
      { q: 'Item $1,800 pre-tax. SafeLock at 14%, rounded to nearest $9.99?', choices: ['$249.99', '$252.00', '$259.99', '$269.99'], correct: 0, explain: '$1,800 × 0.14 = $252 → rounded to nearest $9.99 = $249.99. Always round to the nearest $9.99.' },
      { q: 'Total with tax $2,165 (8.25% tax). Pre-tax amount?', choices: ['$1,950', '$2,000', '$2,050', '$1,900'], correct: 1, explain: '$2,165 ÷ 1.0825 = $2,000 pre-tax.' },
      { q: 'Sofa $899, loveseat $699, end table $179. Subtotal?', choices: ['$1,777', '$1,800', '$1,750', '$1,825'], correct: 0, explain: '$899 + $699 + $179 = $1,777.' },
      { q: 'When should you pull the Affordability Calculator?', choices: ['Only when guest asks for monthly payments', 'Whenever a budget signal hits — "that\'s a lot" or anything over $1,000', 'Only at the end', 'Only when financing is requested'], correct: 1, explain: 'Pull it on any budget signal. Make price a conversation.' },
      { q: 'After building a quote, you ALWAYS:', choices: ['Hand the iPad over and walk away', 'Save with name + contact and send before they leave', 'Print and toss it', 'Move on without saving'], correct: 1, explain: 'Save and send every quote. Builds your follow-up pipeline.' },
      { q: 'Which finance partner has the strongest approval rates for typical credit?', choices: ['Affirm', 'Synchrony', 'Wells Fargo', 'American Express'], correct: 1, explain: 'Synchrony = strongest approval rates, default for typical credit.' },
      { q: 'Tax in our system is calculated on:', choices: ['Merchandise + SafeLock', 'Merchandise only — NOT on SafeLock', 'Everything including delivery', 'Just the discount amount'], correct: 1, explain: 'Tax is on merchandise only. SafeLock is not taxed.' },
      { q: 'The right time to ask "What\'s your budget?" is:', choices: ['Right after greeting', 'Through discovery — listen for budget signals naturally', 'Never', 'Only after showing the price'], correct: 1, explain: 'Don\'t ask budget cold. Listen for signals during discovery.' },
      { q: 'For a guest saying "$3,500 is a lot," your move is:', choices: ['Drop the price', 'Pull the calculator and reframe as monthly payment', 'Show a cheaper option', 'Walk away'], correct: 1, explain: 'Pull the calc. "At $87/month, that\'s about a coffee a day."' }
    ]
  },
  3: {
    name: 'Day 3: SHOW & SOLVE + Product Knowledge',
    pass: 80,
    questions: [
      { q: 'The mistake new RSAs make in SHOW & SOLVE is:', choices: ['Showing too few options', 'Showing too much — reciting features past 10 sofas', 'Talking about price too soon', 'Skipping the bridge'], correct: 1, explain: 'Tour-guiding kills sales. Show 2–3 options, not 10.' },
      { q: 'In Feature → Benefit → Bridge, the BRIDGE is:', choices: ['The price tag', 'Tying the feature back to a need the guest told you', 'A walking path through the store', 'A discount offer'], correct: 1, explain: 'Bridge connects feature → benefit → THIS guest\'s specific need from A&L.' },
      { q: 'How many options should you show in SHOW & SOLVE?', choices: ['1', '2–3', '5–7', '10+'], correct: 1, explain: 'The brain shuts down past three. Show 2–3.' },
      { q: 'Story selling cuts through faster than:', choices: ['Discounts', 'Specs', 'Financing', 'Warranties'], correct: 1, explain: 'Stories beat specs. Build a story library.' },
      { q: 'When the guest says "that\'s a lot," your immediate move is:', choices: ['Apologize for the price', 'Pull the Affordability Calculator', 'Drop to a cheaper item', 'Offer a discount'], correct: 1, explain: 'Calculator turns price into payment. Payment is easier to say yes to.' },
      { q: 'A "trial close" is:', choices: ['The actual close', 'A test question to read the buyer\'s temperature', 'A discount offer', 'A return policy'], correct: 1, explain: 'Trial close = "How does this feel?" / "Out of the two, which?" Test the temperature.' },
      { q: 'Which is NOT a major Ashley furniture category?', choices: ['Stationary upholstery', 'Bedroom casegoods', 'Outdoor patio', 'Custom firearms'], correct: 3, explain: 'We don\'t sell firearms. Major categories: upholstery, motion, bedroom, dining, mattress, accents, rugs.' },
      { q: 'A "1-motion" recliner means:', choices: ['One color only', 'One mechanism — recline only', 'One year warranty', 'One assembly required'], correct: 1, explain: 'A 1-motion recliner has one motion (recline). 2-motion adds a powered headrest, etc.' },
      { q: 'Premium Platform Seating Technology benefits include:', choices: ['Faster delivery', 'Even weight distribution and reduced sagging', 'Cheaper materials', 'No assembly'], correct: 1, explain: 'Engineered support distributes weight, prevents sagging spots.' },
      { q: 'The Two-Choice Show is best framed as:', choices: ['"Pick whichever, doesn\'t matter."', '"Compare these two — both fit, but they solve it differently."', '"This one is best, the other is cheap."', '"Take this one, it\'s on sale."'], correct: 1, explain: 'Frame it as a comparison that highlights how each solves their problem differently.' }
    ]
  },
  4: {
    name: 'Day 4: YES + Financing & Ticketing',
    pass: 80,
    questions: [
      { q: 'Most lost sales are lost because:', choices: ['Price was too high', 'Product was wrong', 'Nobody asked for the close', 'Wrong color'], correct: 2, explain: 'They never volunteer the close. You have to ask.' },
      { q: 'Which is an Assumption Close?', choices: ['"Want to think about it?"', '"When would you like delivery?"', '"Is the price OK?"', '"Are you sure?"'], correct: 1, explain: 'Assumption close = assume they\'re buying. "When would you like delivery?"' },
      { q: 'Which is an Alternative Close?', choices: ['"Yes or no?"', '"Cash or financing today?"', '"Now or later?"', '"This or nothing?"'], correct: 1, explain: 'Alternative close = two yes options. "Cash or financing?"' },
      { q: 'A buying signal is:', choices: ['"This costs too much"', '"How does delivery work?"', '"I need to think"', '"Just looking"'], correct: 1, explain: 'Asking about delivery, financing, warranty = green light. They\'re already deciding.' },
      { q: 'When asking for the sale, your tone should be:', choices: ['Apologetic and tentative', 'Direct and confident — no flinching', 'Aggressive and pushy', 'Casual and indifferent'], correct: 1, explain: 'Direct, confident, no apology. Whoever speaks first after the close question loses.' },
      { q: 'If the guest says "not today," you should:', choices: ['Drop the price 50%', 'Save the quote, set a follow-up, hand them a card', 'Walk away', 'Tell them to come back'], correct: 1, explain: 'Save the quote, send it, set follow-up. The fortune is in the follow-up.' },
      { q: 'Which finance partner pulls a soft credit and gives quick approval?', choices: ['Synchrony', 'Wells Fargo', 'Affirm', 'Discover'], correct: 2, explain: 'Affirm — soft credit pull, online-style experience.' },
      { q: 'After the guest says yes, you must confirm:', choices: ['Just the price', 'Total, delivery, Safelock, your contact info', 'Only delivery date', 'Just sign the receipt'], correct: 1, explain: 'Total, delivery, Safelock, your card, real thank-you.' },
      { q: 'A Takeaway Close uses:', choices: ['A discount', 'Loss aversion — "maybe this isn\'t the right fit"', 'Urgency timing', 'Social proof'], correct: 1, explain: 'Takeaway close: psychology of loss. "Maybe this isn\'t for you."' },
      { q: 'After a "not today" guest leaves with a saved quote, you should:', choices: ['Forget about them', 'Add to your undelivered/follow-up list and work it weekly', 'Call them every day', 'Wait for them to call'], correct: 1, explain: 'Undelivered list. Weekly. The fortune is in the follow-up.' }
    ]
  },
  5: {
    name: 'Day 5: System & Money',
    pass: 80,
    questions: [
      { q: 'When you key a ticket in POS, the SafeLock plan is added:', choices: ['As a discount line', 'As a separate non-taxed line item attached to the order', 'Inside the merchandise total', 'Only on bedding orders'], correct: 1, explain: 'SafeLock is its own line — non-taxed, attached to the order.' },
      { q: 'Tax on the ticket is calculated on:', choices: ['Merchandise + SafeLock + delivery', 'Merchandise only', 'Just bedding', 'The grand total'], correct: 1, explain: 'Tax is on merchandise. SafeLock and delivery are not taxed.' },
      { q: 'Which finance partner has the strongest approval rate for typical credit?', choices: ['Affirm', 'Synchrony', 'Wells Fargo', 'Ashley Card'], correct: 1, explain: 'Synchrony — strongest approval, default for typical credit.' },
      { q: 'A guest with a soft-pull, online-style preference is best matched to:', choices: ['Synchrony', 'Wells Fargo', 'Affirm', 'Cash only'], correct: 2, explain: 'Affirm = soft credit pull, quick approval, online experience.' },
      { q: 'Wells Fargo is the best fit when:', choices: ['Quick mobile approval is needed', 'The guest already banks with WF and the ticket is large', 'The guest has thin credit', 'The guest wants no commitment'], correct: 1, explain: 'WF — premium tier, longer terms, good for existing WF customers and big tickets.' },
      { q: 'On a $1,500 pre-tax purchase, SafeLock is:', choices: ['$99.99 flat', '$169.99 flat', '14% × $1,500 = $209.99', 'No charge'], correct: 2, explain: 'Over $1,200 → 14% of pre-tax, rounded to nearest $9.99. $1,500 × 0.14 = $210 → $209.99.' },
      { q: 'On a $700 pre-tax purchase, SafeLock is:', choices: ['$99.99 flat', '$169.99 flat', '14% × $700 = $98.00', 'No charge'], correct: 0, explain: 'Items under $800 → flat $99.99.' },
      { q: 'On a $1,000 pre-tax purchase, SafeLock is:', choices: ['$99.99 flat', '$169.99 flat', '14% × $1,000 = $140', 'No charge'], correct: 1, explain: 'Items $801–$1,200 → flat $169.99.' },
      { q: 'Your SafeLock commission rate is:', choices: ['10% of every plan', '15% of every plan', '20% of every plan', '25% of every plan'], correct: 2, explain: '20% commission on every SafeLock plan you sell.' },
      { q: 'Why offer SafeLock on every sale?', choices: ['It\'s required by law', 'If unused in 4 years, the guest gets full value back as in-store credit — there is no losing version', 'It guarantees a return customer', 'It replaces the manufacturer warranty'], correct: 1, explain: 'Unused = full value back as store credit in 90 days post-expiration. No losing version.' },
      { q: 'Delivery attachment matters because:', choices: ['It\'s required by Ashley', 'It\'s a bonus tier — 5%+ of volume hits the floor; 6.5%+ tops the tier', 'The factory makes us', 'It\'s only for bedding'], correct: 1, explain: '5% delivery floor, 6.5%+ for top tier ($500/qtr).' },
      { q: 'When pitching delivery, your move is:', choices: ['Wait for the guest to ask', 'Bring it up after the close as a routine line item: "We deliver Tuesday or Thursday — which works?"', 'Skip it for cash buyers', 'Only mention it for bedding'], correct: 1, explain: 'Assume delivery. Make it routine. Pick a day, not yes/no.' },
      { q: 'A guest says "I\'ll pick it up." Your response is:', choices: ['"Okay, no problem."', '"Sure — though for $X delivered, we bring it in, set it up, take the trash. Want me to add that?"', 'Drop the price.', 'Walk away.'], correct: 1, explain: 'Reframe pickup vs delivered + setup + haul-away. Often flips the answer.' },
      { q: 'The accumulated-damage exclusion in SafeLock means:', choices: ['Guests can\'t make any claims', 'Guests must report each incident promptly — accumulation = denial', 'SafeLock is invalid after 1 year', 'Pets aren\'t covered'], correct: 1, explain: 'Report every incident. Accumulation is the #1 reason claims get denied.' },
      { q: 'For a $3,000 pre-tax ticket with SafeLock at 14% and 8.25% tax, the SafeLock is:', choices: ['$420 (rounds to $419.99)', '$249.99', '$99.99', '$520'], correct: 0, explain: '$3,000 × 0.14 = $420 → $419.99 with the rounding rule.' },
      { q: 'When writing the ticket, you confirm with the guest:', choices: ['Just the total', 'Total, delivery date, SafeLock coverage, your contact info', 'Only the financing terms', 'Only the merchandise list'], correct: 1, explain: 'Total + delivery + SafeLock + your card + real thank-you. Confirm everything before they leave.' },
      { q: 'A guest asks "what if I can\'t afford the down payment?" Your move:', choices: ['Drop the price', 'Pull the calculator and show 0% with no down on Synchrony, or split with Affirm', 'Tell them to come back later', 'Show a cheaper item'], correct: 1, explain: 'Calculator + the right finance partner. Most 0% offers require no down with Synchrony.' },
      { q: 'For a follow-up after a "not today," your tool is:', choices: ['Memory', 'The saved quote in the calculator + your undelivered list', 'A printed catalog', 'Email blast'], correct: 1, explain: 'Save quote → it goes to your follow-up queue + the undelivered list. Work it weekly.' },
      { q: 'Your written margin floor to qualify for any quarterly bonus is:', choices: ['35%', '45%', '53%', '60%'], correct: 2, explain: '53% margin (incl. delivery and SafeLock) is the floor.' },
      { q: 'The Delivery bonus tier hit at 6.5%+ pays:', choices: ['$100', '$250', '$500', '$1,000'], correct: 2, explain: '6.5%+ delivery = $500 per quarter top tier.' }
    ]
  },
  6: {
    name: 'Day 6: BEDDING + Final Certification Exam',
    pass: 80,
    questions: [
      { q: 'The bedding flow starts with:', choices: ['The most expensive mattress', 'A pillow (or Reveal scan if your store uses it)', 'The adjustable base', 'The protector'], correct: 1, explain: 'Pillow first sets posture. Stores with Reveal scan that first, then pillow.' },
      { q: 'Why is the adjustable base demo always done?', choices: ['It\'s required by law', 'Many guests change their minds once they see it move', 'The factory makes us', 'It\'s free'], correct: 1, explain: 'Always demo. Premium attachment lifts the whole ticket.' },
      { q: 'Which brand is known for the "Purple Grid"?', choices: ['Tempur-Pedic', 'Beautyrest', 'Purple', 'Sealy'], correct: 2, explain: 'Purple\'s gel grid is their signature. Polarizing — guests love it or don\'t.' },
      { q: 'Which is REQUIRED for the warranty to stay valid?', choices: ['Adjustable base', 'Mattress protector', 'Premium sheets', 'Two pillows'], correct: 1, explain: 'Mattress protector is a warranty requirement. Non-negotiable on every bedding sale.' },
      { q: 'For a guest who says "just a mattress today," you should:', choices: ['Walk away', 'Show them the protection — that\'s what keeps the warranty valid', 'Argue with them', 'Give a discount'], correct: 1, explain: 'Even "just a mattress" gets the protector pitch. It\'s about warranty, not upsell.' },
      { q: 'On a $2,000 pre-tax mattress purchase, SafeLock at 14% is:', choices: ['$200', '$250', '$280', '$300'], correct: 2, explain: '$2,000 × 0.14 = $280 (rounded to $279.99 with the rounding rule).' },
      { q: 'If a guest says "I\'ll think about it" on a mattress:', choices: ['Pressure them to buy', 'Save the quote, set follow-up, hand them a Rest Test coupon', 'Drop the price', 'Walk away'], correct: 1, explain: 'Same playbook as YES. Save quote, follow up, give them a reason to come back.' },
      { q: 'The required attachments on every bedding sale are:', choices: ['Just sheets', 'Protector, pillows, base demo, and offer of sheets', 'Only the mattress', 'Pillows only'], correct: 1, explain: 'Protector + pillows + base demo + sheets. Every bedding sale.' },
      { q: 'In the QAS Model used in ENGAGE, which is the Question?', choices: ['"Do you want leather?"', '"What\'s been the best part of your week?"', '"How much can you spend?"', '"When do you need delivery?"'], correct: 1, explain: 'QAS Question is about THE PERSON, not furniture.' },
      { q: 'A guest is checking a price tag. This is a sign of:', choices: ['Disinterest', 'A Window of Opportunity for re-engagement', 'They\'re leaving', 'They want a discount'], correct: 1, explain: 'Window of Opportunity. Approach with personality and value.' },
      { q: 'The 5 Whats include all EXCEPT:', choices: ['What room', 'What use', 'What budget signals', 'What credit score'], correct: 3, explain: 'Room, Use, Timeframe, Works/Doesn\'t, Budget Signals. We never ask about credit score.' },
      { q: 'Feature → Benefit → Bridge requires you to:', choices: ['List specs', 'Tie every feature back to something the guest told you', 'Give a discount', 'Skip features entirely'], correct: 1, explain: 'Bridge = the connection back to A&L discovery.' },
      { q: 'The Million Dollar Writer rate jumps to:', choices: ['5.5% / 22.5% the next year', '10% the next year', '20% the next year', 'No change'], correct: 0, explain: 'Hit $1M, next year jumps to 5.5% on furniture/mattress and 22.5% on Safelock.' },
      { q: 'Which is the official Ashley sales progression target?', choices: ['$0 → $500K → $1M', 'START → $900K → $1.25M', '$100K → $500K → $1.5M', '$250K → $750K → $1M'], correct: 1, explain: 'START $0 → GOOD $900K → GREAT $1.25M.' },
      { q: 'For a NO Regard guest, the re-engagement window opens after:', choices: ['10 seconds', '1 minute', '2 minutes', '5 minutes'], correct: 2, explain: '2-minute minimum. Watch for the Window of Opportunity.' }
    ]
  }
};

// ===== CHEATS METADATA =====
const cheatsMeta = [
  { id: 'engage', step: 'STEP 1', name: 'ENGAGE', tagline: 'Build a person-to-person connection.', day: 1, color: ORANGE },
  { id: 'ask', step: 'STEP 2', name: 'ASK & LISTEN', tagline: 'Past what they say, to what they mean.', day: 2, color: ORANGE },
  { id: 'show', step: 'STEP 3', name: 'SHOW & SOLVE', tagline: 'Present the fit, not the catalog.', day: 3, color: ORANGE },
  { id: 'yes', step: 'STEP 4', name: 'YES', tagline: 'Ask for the sale. Finish strong.', day: 4, color: ORANGE },
  { id: 'pos', step: 'SYSTEM', name: 'HOMES POS', tagline: 'Customer in. Sale up. Ticket clean.', day: 5, color: ORANGE },
  { id: 'delivery', step: 'ATTACH', name: 'Delivery Pitch', tagline: 'Make delivery routine, not optional.', day: 5, color: ORANGE },
  { id: 'bedding', step: 'BEDDING', name: 'BEDDING', tagline: 'The biggest commission per sale.', day: 6, color: ORANGE },
  { id: 'safelock', step: 'PROTECTION', name: 'SafeLock', tagline: '4 years. No losing version.', day: null },
  { id: 'finance', step: 'FINANCING', name: 'Finance Partner Picker', tagline: 'Match the guest to the right partner.', day: null },
  { id: 'foursquare', step: 'PRESENTATION', name: '4-Square Financing', tagline: 'Show all options side-by-side.', day: null },
  { id: 'calc', step: 'TOOL', name: 'Affordability Calculator', tagline: 'Make price a conversation.', day: null },
  { id: 'master', step: 'REFERENCE', name: 'E.A.S.Y. Master Reference', tagline: 'The whole system, one doc.', day: null },
  { id: 'beliefs', step: 'CULTURE', name: 'What We Believe', tagline: 'Vision, mission, core beliefs.', day: null },
  { id: 'earnings', step: 'COMPENSATION', name: '2026 Earnings Maximizer', tagline: 'Bonus tiers + Million Dollar Writer.', day: null },
  { id: 'beddingcert', step: 'CERTIFICATION', name: 'Bedding Cert Roadmap', tagline: 'Foundations + Advanced.', day: null },
  { id: 'hygiene', step: 'POLICY', name: 'Hygiene & Dress Code', tagline: 'How we show up to work.', day: null },
  { id: 'nonneg', step: 'CULTURE', name: 'The Non-Negotiables', tagline: 'The six rules. No exceptions.', day: null },
  { id: 'objections', step: 'CLOSING', name: 'Objection Library', tagline: 'What to say when they push back.', day: null },
  { id: 'upboard', step: 'FLOOR', name: 'The Up Board', tagline: 'Rotation rules + Portal how-to.', day: null },
  { id: 'rsamath', step: 'SKILLS', name: 'RSA Math', tagline: 'The numbers you do every day.', day: null },
  // ===== Backlog cheats — full content lands in next session =====
  { id: 'ashleystory', step: 'NARRATIVE', name: 'The Ashley Story', tagline: 'For Low Regard openers and Support bridges.', day: null, stub: true },
  { id: 'managerintro', step: 'HAND-OFF', name: 'Manager\'s Introduction', tagline: 'Effective turnovers close sales.', day: null },
  { id: 'ashleytools', step: 'TOOLS', name: 'Ashley Tools Walk', tagline: 'GE Handout, Advantage Card, Sleep Flyer, Gallery.', day: null, stub: true },
  { id: 'phoneleads', step: 'PROSPECTING', name: 'Phone & Web Leads', tagline: 'Inbound calls, web inquiries, appointments.', day: null, stub: true },
  { id: 'tcharts', step: 'CLOSING', name: 'T-Charts', tagline: 'Cash vs finance. Two-product. Today vs wait.', day: null, stub: true },
  { id: 'customerservice', step: 'POST-SALE', name: 'Customer Service Basics', tagline: 'Returns. Service claims. The thank-you note.', day: null, stub: true },
];

// ===== Browser-compatible storage shim (works on real browsers via localStorage) =====
const _storage = {
  get: async (key) => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      return v === null ? null : { key, value: v };
    } catch { return null; }
  },
  set: async (key, value) => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    } catch {}
  },
  delete: async (key) => {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    } catch {}
  },
};

// ===== STORAGE =====
const STORAGE_KEY = 'launch:state'; // legacy — single-profile fallback
const PROFILES_INDEX_KEY = 'launch:profiles_index';
const ACTIVE_PROFILE_KEY = 'launch:active_profile';
const PROFILE_KEY = (id) => `launch:profile:${id}`;
const TRAINER_EMAIL_KEY = 'launch:trainer_email';
const DEFAULT_TRAINER_EMAIL = 'jmerritt@5thandhomefurniture.com';

const loadState = async () => {
  try {
    const r = await _storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
};
const saveState = async (state) => {
  try { await _storage.set(STORAGE_KEY, JSON.stringify(state)); } catch {}
};

const loadProfilesIndex = async () => {
  try {
    const r = await _storage.get(PROFILES_INDEX_KEY);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
};
const saveProfilesIndex = async (idx) => {
  try { await _storage.set(PROFILES_INDEX_KEY, JSON.stringify(idx)); } catch {}
};
const loadProfileState = async (id) => {
  try {
    const r = await _storage.get(PROFILE_KEY(id));
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
};
const saveProfileState = async (id, state) => {
  try { await _storage.set(PROFILE_KEY(id), JSON.stringify(state)); } catch {}
};
const deleteProfileState = async (id) => {
  try { await _storage.delete(PROFILE_KEY(id)); } catch {}
};
const getActiveProfileId = async () => {
  try {
    const r = await _storage.get(ACTIVE_PROFILE_KEY);
    return r ? r.value : null;
  } catch { return null; }
};
const setActiveProfileId = async (id) => {
  try {
    if (id) await _storage.set(ACTIVE_PROFILE_KEY, id);
    else await _storage.delete(ACTIVE_PROFILE_KEY);
  } catch {}
};
const getTrainerEmail = async () => {
  try {
    const r = await _storage.get(TRAINER_EMAIL_KEY);
    return r ? r.value : DEFAULT_TRAINER_EMAIL;
  } catch { return DEFAULT_TRAINER_EMAIL; }
};
const setTrainerEmail = async (email) => {
  try { await _storage.set(TRAINER_EMAIL_KEY, email); } catch {}
};
const newProfileId = () => 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

// ============ MAIN APP ============
export default function LaunchApp() {
  const [tab, setTab] = useState('today');
  const [activeCheat, setActiveCheat] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResult, setShowResult] = useState(false);
  const [quizMode, setQuizMode] = useState('idle'); // idle | active | done
  
  // Persisted state
  const [completedDays, setCompletedDays] = useState([]);
  const [quizScores, setQuizScores] = useState({});
  const [trainerMode, setTrainerMode] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [bonus, setBonus] = useState({
    log: [],
    periodStart: 0,
    quarterStart: 0,
    qMargin: 53,
    qHours: 0,
    qRT: 0,
    rateTier: 0,
  });
  const [drillNotes, setDrillNotes] = useState({});
  const [beddingCert, setBeddingCert] = useState({ session1: false, session2: false });
  const [revealStore, setRevealStore] = useState(false);
  // Welcome / onboarding
  const [welcomed, setWelcomed] = useState(false);
  const [traineeName, setTraineeName] = useState('');
  const [assessment, setAssessment] = useState(null);
  const [signatures, setSignatures] = useState({});
  const [hrForms, setHrForms] = useState({});
  const [emergencyContact, setEmergencyContact] = useState({});
  const [pin, setPin] = useState('');
  // In-flight welcome flow progress (so trainees can resume if they close mid-flow)
  const [welcomeProgress, setWelcomeProgress] = useState({
    step: 0,
    tempName: '',
    ratings: {},
    fillIns: {},
    hope: '',
    ratingPage: 0,
    fillPage: 0,
  });
  
  // ===== PROFILE LAYER =====
  // profileMode: 'loading' | 'picker' | 'pin' | 'creating' | 'app'
  const [profileMode, setProfileMode] = useState('loading');
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null); // id
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, setPinError] = useState(false);
  const [trainerEmail, setTrainerEmailState] = useState(DEFAULT_TRAINER_EMAIL);
  const [hydrating, setHydrating] = useState(false); // true during state-load to prevent save-loop
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  
  const hydrateFromState = (s) => {
    setHydrating(true);
    setCompletedDays(s.completedDays || []);
    setQuizScores(s.quizScores || {});
    setTrainerMode(s.trainerMode || false);
    setCurrentDay(s.currentDay || 1);
    setDrillNotes(s.drillNotes || {});
    setBeddingCert(s.beddingCert || { session1: false, session2: false });
    setRevealStore(s.revealStore || false);
    if (s.bonus && Array.isArray(s.bonus.log)) setBonus(s.bonus);
    setWelcomed(s.welcomed || false);
    setTraineeName(s.traineeName || '');
    setAssessment(s.assessment || null);
    setSignatures(s.signatures || {});
    setHrForms(s.hrForms || {});
    setEmergencyContact(s.emergencyContact || {});
    setPin(s.pin || '');
    setWelcomeProgress(s.welcomeProgress || { step: 0, tempName: '', ratings: {}, fillIns: {}, hope: '', ratingPage: 0, fillPage: 0 });
    // Allow saves on next tick
    setTimeout(() => setHydrating(false), 50);
  };
  
  const blankState = () => {
    setCompletedDays([]);
    setQuizScores({});
    setCurrentDay(1);
    setDrillNotes({});
    setBeddingCert({ session1: false, session2: false });
    setBonus({ log: [], periodStart: 0, quarterStart: 0, qMargin: 53, qHours: 0, qRT: 0, rateTier: 0 });
    setWelcomed(false);
    setTraineeName('');
    setAssessment(null);
    setSignatures({});
    setHrForms({});
    setEmergencyContact({});
    setPin('');
    setWelcomeProgress({ step: 0, tempName: '', ratings: {}, fillIns: {}, hope: '', ratingPage: 0, fillPage: 0 });
  };
  
  // Initial load: profiles, migrate legacy state if needed
  useEffect(() => {
    (async () => {
      const email = await getTrainerEmail();
      setTrainerEmailState(email);
      
      const idx = await loadProfilesIndex();
      
      if (idx.length === 0) {
        // No profiles yet — check legacy single-profile state
        const legacy = await loadState();
        if (legacy && (legacy.welcomed || legacy.traineeName)) {
          // Migrate legacy → profile #1
          const id = newProfileId();
          const profile = { id, name: legacy.traineeName || 'Returning User', lastActive: Date.now(), hasPin: false, createdAt: Date.now() };
          await saveProfilesIndex([profile]);
          await saveProfileState(id, legacy);
          await setActiveProfileId(id);
          setProfiles([profile]);
          setActiveProfile(id);
          hydrateFromState(legacy);
          setProfileMode('app');
          return;
        }
        // Truly fresh — go to picker which offers create flow
        setProfileMode('picker');
        return;
      }
      
      // Profiles exist
      setProfiles(idx);
      const activeId = await getActiveProfileId();
      const found = activeId && idx.find(p => p.id === activeId);
      if (found) {
        // Auto-resume last-used profile
        if (found.hasPin) {
          setActiveProfile(activeId);
          setProfileMode('pin');
        } else {
          const s = await loadProfileState(activeId);
          if (s) hydrateFromState(s); else blankState();
          setActiveProfile(activeId);
          setProfileMode('app');
        }
      } else {
        // Active profile not found — show picker
        setProfileMode('picker');
      }
    })();
  }, []);
  
  // Save on change — profile-keyed
  useEffect(() => {
    if (hydrating) return; // don't save while loading
    if (!activeProfile) return; // no active profile = no save
    if (profileMode !== 'app' && profileMode !== 'creating') return;
    
    const state = { completedDays, quizScores, trainerMode, currentDay, drillNotes, beddingCert, revealStore, bonus, welcomed, traineeName, assessment, signatures, hrForms, emergencyContact, pin, welcomeProgress };
    saveProfileState(activeProfile, state);
    
    // Update profile index entry (lastActive, name, hasPin)
    setProfiles(prev => {
      const next = prev.map(p =>
        p.id === activeProfile
          ? { ...p, name: traineeName || p.name, lastActive: Date.now(), hasPin: !!pin }
          : p
      );
      saveProfilesIndex(next);
      return next;
    });
  }, [activeProfile, profileMode, hydrating, completedDays, quizScores, trainerMode, currentDay, drillNotes, beddingCert, revealStore, bonus, welcomed, traineeName, assessment, signatures, hrForms, emergencyContact, pin, welcomeProgress]);
  
  // ===== PROFILE ACTIONS =====
  const createNewProfile = async () => {
    const id = newProfileId();
    const profile = { id, name: 'New Trainee', lastActive: Date.now(), hasPin: false, createdAt: Date.now() };
    const next = [...profiles, profile];
    setProfiles(next);
    await saveProfilesIndex(next);
    await setActiveProfileId(id);
    setActiveProfile(id);
    blankState();
    setProfileMode('creating'); // welcome flow runs
  };
  
  const selectProfile = async (id) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    setActiveProfile(id);
    await setActiveProfileId(id);
    if (profile.hasPin) {
      setPinAttempt('');
      setPinError(false);
      setProfileMode('pin');
    } else {
      const s = await loadProfileState(id);
      if (s) hydrateFromState(s); else blankState();
      setProfileMode(s && s.welcomed ? 'app' : 'creating');
    }
  };
  
  const verifyPin = async (entered) => {
    const profile = profiles.find(p => p.id === activeProfile);
    if (!profile) return;
    const s = await loadProfileState(activeProfile);
    if (s && s.pin === entered) {
      hydrateFromState(s);
      setPinAttempt('');
      setPinError(false);
      setProfileMode(s.welcomed ? 'app' : 'creating');
    } else {
      setPinError(true);
      setPinAttempt('');
    }
  };
  
  const switchUser = async () => {
    setActiveProfile(null);
    await setActiveProfileId(null);
    setProfileMode('picker');
    blankState();
  };
  
  const deleteProfile = async (id) => {
    const next = profiles.filter(p => p.id !== id);
    setProfiles(next);
    await saveProfilesIndex(next);
    await deleteProfileState(id);
    if (activeProfile === id) {
      setActiveProfile(null);
      await setActiveProfileId(null);
      blankState();
      setProfileMode(next.length === 0 ? 'picker' : 'picker');
    }
  };
  
  const updateTrainerEmail = async (e) => {
    setTrainerEmailState(e);
    await setTrainerEmail(e);
  };
  
  const dayUnlocked = (d) => d <= currentDay;
  
  const startQuiz = (day) => {
    setActiveQuiz(day);
    setQIdx(0);
    setAnswers({});
    setShowResult(false);
    setQuizMode('active');
  };
  
  const finishQuiz = (day) => {
    const correct = quizzes[day].questions.filter((q, i) => answers[i] === q.correct).length;
    const pct = Math.round((correct / quizzes[day].questions.length) * 100);
    const passed = pct >= quizzes[day].pass;
    
    setQuizScores({ ...quizScores, [day]: { score: correct, total: quizzes[day].questions.length, pct, passed, when: Date.now() } });
    
    if (passed && !completedDays.includes(day)) {
      setCompletedDays([...completedDays, day]);
      if (day === currentDay && currentDay < 6) {
        setCurrentDay(currentDay + 1);
      }
    }
    setQuizMode('done');
  };
  
  const resetProgress = () => {
    if (confirm('Reset this profile? Clears your quiz scores, completed days, sales log, signatures — but keeps your name and PIN. Other profiles on this device are unaffected.')) {
      setCompletedDays([]);
      setQuizScores({});
      setCurrentDay(1);
      setDrillNotes({});
      setBeddingCert({ session1: false, session2: false });
      setBonus({ log: [], periodStart: 0, quarterStart: 0, qMargin: 53, qHours: 0, qRT: 0, rateTier: 0 });
      setAssessment(null);
      setSignatures({});
      setHrForms({});
    }
  };
  
  // Trainer escape hatch (double-tap status bar) — only useful from picker
  const skipWelcome = () => {
    if (profileMode === 'picker') {
      // jump straight into a temp profile for testing
      createNewProfile();
    }
  };
  
  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        background: 'linear-gradient(180deg, #2A1F18 0%, #1F1F1F 100%)',
        minHeight: '100vh',
      }}
      className="flex items-center justify-center p-4"
    >
      <div
        className="w-full max-w-md bg-white relative overflow-hidden"
        style={{
          minHeight: '780px',
          maxHeight: '900px',
          borderRadius: '32px',
          boxShadow: '0 25px 80px rgba(0,0,0,0.4), 0 0 0 8px #1a1a1a, 0 0 0 9px #2a2a2a',
        }}
      >
        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pt-3 pb-1 bg-white">
          {profileMode === 'app' && traineeName ? (
            <button onClick={() => setShowProfileSheet(true)} className="flex items-center gap-1.5 active:opacity-60">
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: ORANGE_TINT }}>
                <div className="text-[9px] font-bold" style={{ color: ORANGE_DARK }}>{traineeName.charAt(0).toUpperCase()}</div>
              </div>
              <span className="text-xs font-semibold" style={{ color: DARK }}>{traineeName.split(' ')[0]}</span>
              <ChevronRight size={11} style={{ color: MID, transform: 'rotate(90deg)' }} />
            </button>
          ) : (
            <span className="text-xs font-semibold" style={{ color: DARK }} onDoubleClick={skipWelcome}>The Launch</span>
          )}
          <div className="flex items-center gap-1">
            {trainerMode && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: ORANGE, color: '#fff' }}>TRAINER</span>}
            <span className="text-xs font-medium" style={{ color: DARK }}>5G</span>
          </div>
        </div>
        
        {/* Profile sheet (sign out / switch user) */}
        {showProfileSheet && (
          <ProfileSheet
            traineeName={traineeName}
            pin={pin}
            onClose={() => setShowProfileSheet(false)}
            onSwitchUser={() => { setShowProfileSheet(false); switchUser(); }}
            onSignOut={async () => {
              setShowProfileSheet(false);
              // Sign out = lock this profile (require PIN next open) if PIN set, else go to picker
              if (pin) {
                await setActiveProfileId(null);
                setActiveProfile(null);
                blankState();
                setProfileMode('picker');
              } else {
                switchUser();
              }
            }}
          />
        )}
        
        {/* Loading state */}
        {profileMode === 'loading' && (
          <div className="flex items-center justify-center" style={{ height: '750px', background: IOS_BG }}>
            <div className="text-xs" style={{ color: MID }}>Loading…</div>
          </div>
        )}
        
        {/* Profile picker */}
        {profileMode === 'picker' && (
          <ProfilePicker
            profiles={profiles}
            onSelect={selectProfile}
            onCreate={createNewProfile}
            onDelete={deleteProfile}
            trainerEmail={trainerEmail}
            setTrainerEmail={updateTrainerEmail}
          />
        )}
        
        {/* PIN entry */}
        {profileMode === 'pin' && (
          <PinEntry
            profile={profiles.find(p => p.id === activeProfile)}
            attempt={pinAttempt}
            setAttempt={setPinAttempt}
            error={pinError}
            onSubmit={verifyPin}
            onBack={switchUser}
          />
        )}
        
        {/* Welcome flow (first time for a new profile) */}
        {profileMode === 'creating' && !welcomed && (
          <WelcomeFlow
            traineeName={traineeName}
            setTraineeName={setTraineeName}
            assessment={assessment}
            setAssessment={setAssessment}
            signatures={signatures}
            setSignatures={setSignatures}
            hrForms={hrForms}
            setHrForms={setHrForms}
            emergencyContact={emergencyContact}
            setEmergencyContact={setEmergencyContact}
            pin={pin}
            setPin={setPin}
            trainerEmail={trainerEmail}
            welcomeProgress={welcomeProgress}
            setWelcomeProgress={setWelcomeProgress}
            activeProfile={activeProfile}
            getCurrentState={() => ({ completedDays, quizScores, trainerMode, currentDay, drillNotes, beddingCert, revealStore, bonus, traineeName, assessment, signatures, hrForms, emergencyContact, pin, welcomeProgress })}
            onComplete={async (finalAssessment) => {
              // Force-save welcomed=true with all state including final assessment, BEFORE redirect
              const finalState = { completedDays, quizScores, trainerMode, currentDay, drillNotes, beddingCert, revealStore, bonus, welcomed: true, traineeName, assessment: finalAssessment || assessment, signatures, hrForms, emergencyContact, pin, welcomeProgress: { ...welcomeProgress, step: 999 } };
              await saveProfileState(activeProfile, finalState);
              // Update profile index too
              const nextProfiles = profiles.map(p => p.id === activeProfile ? { ...p, name: traineeName || p.name, lastActive: Date.now(), hasPin: !!pin } : p);
              setProfiles(nextProfiles);
              await saveProfilesIndex(nextProfiles);
              // Now flip the React state
              setWelcomed(true);
              setAssessment(finalAssessment || assessment);
              setProfileMode('app');
            }}
          />
        )}
        
        {/* Main app content */}
        {profileMode === 'app' && (
        <div className="overflow-y-auto" style={{ height: '700px', background: IOS_BG }}>
          {quizMode === 'active' && <QuizActive day={activeQuiz} qIdx={qIdx} setQIdx={setQIdx} answers={answers} setAnswers={setAnswers} showResult={showResult} setShowResult={setShowResult} onFinish={() => finishQuiz(activeQuiz)} onExit={() => setQuizMode('idle')} />}
          {quizMode === 'done' && <QuizResults day={activeQuiz} answers={answers} score={quizScores[activeQuiz]} onRetry={() => startQuiz(activeQuiz)} onExit={() => { setQuizMode('idle'); setTab('today'); }} traineeName={traineeName} trainerEmail={trainerEmail} completedDays={completedDays} quizScores={quizScores} signatures={signatures} hrForms={hrForms} assessment={assessment} />}
          {activeCheat && quizMode === 'idle' && <CheatDetail id={activeCheat} back={() => setActiveCheat(null)} bonus={bonus} setBonus={setBonus} beddingCert={beddingCert} setBeddingCert={setBeddingCert} trainerMode={trainerMode} revealStore={revealStore} />}
          {!activeCheat && quizMode === 'idle' && (
            <>
              {tab === 'today' && <TodayView currentDay={currentDay} completedDays={completedDays} quizScores={quizScores} setActiveCheat={setActiveCheat} startQuiz={startQuiz} dayUnlocked={dayUnlocked} setCurrentDay={setCurrentDay} trainerMode={trainerMode} drillNotes={drillNotes} setDrillNotes={setDrillNotes} traineeName={traineeName} />}
              {tab === 'learn' && <LearnView setActiveCheat={setActiveCheat} dayUnlocked={dayUnlocked} />}
              {tab === 'quiz' && <QuizHome quizScores={quizScores} dayUnlocked={dayUnlocked} startQuiz={startQuiz} trainerMode={trainerMode} />}
              {tab === 'pay' && <PayView bonus={bonus} setBonus={setBonus} />}
              {tab === 'me' && <MeView completedDays={completedDays} quizScores={quizScores} currentDay={currentDay} trainerMode={trainerMode} setTrainerMode={setTrainerMode} resetProgress={resetProgress} setCurrentDay={setCurrentDay} revealStore={revealStore} setRevealStore={setRevealStore} traineeName={traineeName} assessment={assessment} signatures={signatures} hrForms={hrForms} emergencyContact={emergencyContact} pin={pin} setPin={setPin} switchUser={switchUser} profiles={profiles} activeProfile={activeProfile} trainerEmail={trainerEmail} />}
            </>
          )}
        </div>
        )}
        
        {/* Floating Calculator FAB */}
        {profileMode === 'app' && quizMode === 'idle' && !activeCheat && (
          <button
            onClick={() => window.open(CALC_URL, '_blank')}
            className="absolute right-4 z-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ bottom: '88px', width: '52px', height: '52px', background: ORANGE, boxShadow: '0 6px 16px rgba(243,117,32,0.5), 0 0 0 4px rgba(255,255,255,0.9)' }}
            title="Open Calculator"
          >
            <Calculator size={22} className="text-white" strokeWidth={2.5} />
          </button>
        )}
        
        {/* Bottom Nav */}
        {profileMode === 'app' && quizMode === 'idle' && !activeCheat && <BottomNav tab={tab} setTab={setTab} />}
      </div>
    </div>
  );
}

// ============ TODAY ============
function TodayView({ currentDay, completedDays, quizScores, setActiveCheat, startQuiz, dayUnlocked, setCurrentDay, trainerMode, drillNotes, setDrillNotes, traineeName }) {
  const sched = schedules[currentDay];
  const totalBlocks = sched.blocks.length;
  
  return (
    <div className="pb-4">
      {/* Hero */}
      <div className="px-6 pt-4 pb-6" style={{ background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)` }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-bold tracking-widest text-white/80">THE LAUNCH</div>
          <div className="flex items-center gap-2">
            <button onClick={() => currentDay > 1 && setCurrentDay(currentDay - 1)} disabled={currentDay === 1} className="text-white/80 disabled:opacity-30">‹</button>
            <div className="text-xs font-bold tracking-widest text-white/80">DAY {currentDay} of 6</div>
            <button onClick={() => trainerMode && currentDay < 6 && setCurrentDay(currentDay + 1)} disabled={!trainerMode || currentDay === 6} className="text-white/80 disabled:opacity-30">›</button>
          </div>
        </div>
        <div className="text-white text-3xl font-bold mt-1">{sched.title}</div>
        <div className="text-white/90 text-sm mt-1">Today's step: <span className="font-bold">{sched.step}</span></div>
        
        <div className="flex gap-2 mt-4">
          {[1,2,3,4,5,6].map(d => (
            <div key={d} className="h-1.5 flex-1 rounded-full" style={{ background: completedDays.includes(d) ? '#fff' : (d === currentDay ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)') }} />
          ))}
        </div>
      </div>
      
      {/* Schedule */}
      <div className="px-5 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 px-1" style={{ color: IOS_LABEL_2 }}>Today's Schedule</div>
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
          {sched.blocks.map((b, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: i === sched.blocks.length - 1 ? 'none' : `0.5px solid ${IOS_HAIRLINE}` }}>
              <div className="w-12 flex-shrink-0">
                <div className="text-xs font-bold" style={{ color: DARK, fontVariantNumeric: 'tabular-nums' }}>{b.time}</div>
                <div className="text-[10px]" style={{ color: IOS_LABEL_2, fontVariantNumeric: 'tabular-nums' }}>{b.end}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: DARK }}>{b.block}</div>
                <div className="text-[11px] mt-0.5 mb-1.5" style={{ color: IOS_LABEL_2 }}>{b.detail}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {b.cheatId && (
                    <button onClick={() => setActiveCheat(b.cheatId)} className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ background: ORANGE_TINT, color: ORANGE_DARK }}>
                      Open guide ›
                    </button>
                  )}
                  {b.courseLink && (
                    <button onClick={() => window.open(DISCOVERY_URL, '_blank')} className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: ORANGE_DARK }}>
                      Launch Discovery ›
                    </button>
                  )}
                  {b.isQuiz && (
                    <button onClick={() => startQuiz(b.isQuiz)} className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ background: ORANGE, color: '#fff' }}>
                      {quizScores[b.isQuiz]?.passed ? `✓ ${quizScores[b.isQuiz].pct}%` : 'Take Quiz'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Trainer drill notes */}
      {trainerMode && (
        <div className="px-5 pt-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 px-1" style={{ color: ORANGE_DARK }}>Trainer · Drill Notes</div>
          <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: CARD_SHADOW, border: `1px dashed ${ORANGE}` }}>
            <div className="text-xs mb-2" style={{ color: DARK }}>Day {currentDay} drill: log ONE feedback per round.</div>
            <textarea
              value={drillNotes[currentDay] || ''}
              onChange={(e) => setDrillNotes({ ...drillNotes, [currentDay]: e.target.value })}
              placeholder="Round 1 feedback...&#10;Round 2 feedback..."
              className="w-full p-2 text-xs border rounded-lg resize-none"
              style={{ borderColor: IOS_HAIRLINE, minHeight: '80px', background: IOS_BG }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============ LEARN (cheats list) ============
function LearnView({ setActiveCheat, dayUnlocked }) {
  const stepCheats = cheatsMeta.filter(c => c.day);
  const refCheats = cheatsMeta.filter(c => !c.day);
  
  return (
    <div className="pb-4">
      <div className="px-6 pt-6 pb-4">
        <div className="text-xs font-bold tracking-widest" style={{ color: MID }}>REFERENCE</div>
        <div className="text-2xl font-bold mt-1" style={{ color: DARK }}>Learn</div>
        <div className="text-sm mt-1" style={{ color: MID }}>Tap to open. Available offline.</div>
      </div>
      
      <div className="px-6 mb-2 text-[10px] font-bold tracking-widest" style={{ color: MID }}>E.A.S.Y. STEP CHEAT SHEETS</div>
      <div className="px-6 space-y-2 mb-6">
        {stepCheats.map(c => {
          const locked = c.day && !dayUnlocked(c.day);
          return (
            <button key={c.id} onClick={() => !locked && setActiveCheat(c.id)} disabled={locked} className="w-full text-left rounded-xl p-3 active:scale-98 disabled:opacity-50" style={{ background: locked ? LIGHT_BG : '#fff', border: `1px solid ${locked ? BORDER : ORANGE_TINT}` }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-bold tracking-widest" style={{ color: locked ? MID : ORANGE_DARK }}>{c.step}</div>
                    {c.day && <div className="text-[10px]" style={{ color: MID }}>• Day {c.day}</div>}
                  </div>
                  <div className="text-base font-bold" style={{ color: DARK }}>{c.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: MID }}>{c.tagline}</div>
                </div>
                {locked ? <Lock size={16} style={{ color: MID }} /> : <ChevronRight size={18} style={{ color: ORANGE }} />}
              </div>
            </button>
          );
        })}
      </div>
      
      <div className="px-6 mb-2 text-[10px] font-bold tracking-widest" style={{ color: MID }}>REFERENCES & TOOLS</div>
      <div className="px-6 space-y-2">
        {refCheats.map(c => (
          <button key={c.id} onClick={() => setActiveCheat(c.id)} className="w-full text-left rounded-xl p-3 active:scale-98" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-[10px] font-bold tracking-widest" style={{ color: MID }}>{c.step}</div>
                <div className="text-base font-bold" style={{ color: DARK }}>{c.name}</div>
                <div className="text-xs mt-0.5" style={{ color: MID }}>{c.tagline}</div>
              </div>
              <ChevronRight size={18} style={{ color: MID }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ CHEAT DETAIL ROUTER ============
function CheatDetail({ id, back, bonus, setBonus, beddingCert, setBeddingCert, trainerMode, revealStore }) {
  const meta = cheatsMeta.find(c => c.id === id);
  const Header = ({ subtitle }) => (
    <div className="px-6 pt-4 pb-5" style={{ background: `linear-gradient(135deg, ${DARK} 0%, #2A1F18 100%)` }}>
      <button onClick={back} className="flex items-center gap-2 text-sm font-medium mb-3" style={{ color: '#F8C99B' }}>
        <ArrowLeft size={16} /> Back
      </button>
      <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: ORANGE }}>{meta.step}</div>
      <div className="text-3xl font-bold text-white mb-1">{meta.name}</div>
      <div className="text-sm" style={{ color: '#F8C99B' }}>{subtitle || meta.tagline}</div>
    </div>
  );
  
  return (
    <div className="pb-6">
      <Header />
      {id === 'engage' && <EngageContent />}
      {id === 'ask' && <AskContent />}
      {id === 'show' && <ShowContent />}
      {id === 'yes' && <YesContent />}
      {id === 'pos' && <PosContent />}
      {id === 'delivery' && <DeliveryContent />}
      {id === 'bedding' && <BeddingContent revealStore={revealStore} />}
      {id === 'safelock' && <SafelockContent />}
      {id === 'calc' && <CalcContent />}
      {id === 'master' && <MasterContent />}
      {id === 'beliefs' && <BeliefsContent />}
      {id === 'earnings' && <EarningsContent />}
      {id === 'beddingcert' && <BeddingCertContent cert={beddingCert} setCert={setBeddingCert} trainerMode={trainerMode} />}
      {id === 'hygiene' && <HygieneContent />}
      {id === 'nonneg' && <NonNegotiablesContent />}
      {id === 'objections' && <ObjectionsContent />}
      {id === 'upboard' && <UpBoardContent />}
      {id === 'finance' && <FinancePartnerContent />}
      {id === 'foursquare' && <FourSquareContent />}
      {id === 'rsamath' && <RsaMathContent />}
      {id === 'managerintro' && <ManagerIntroContent />}
      {meta?.stub && <StubContent name={meta.name} />}
    </div>
  );
}

// ============ ENGAGE CONTENT ============
function EngageContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Non-Business Greeting</div>
          <div className="text-xs font-semibold mb-3" style={{ color: DARK }}>A welcome or salutation that does NOT discuss business.</div>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: ORANGE_DARK }}>USE THESE</div>
          {['"Welcome to Ashley! How\'s your day going?"', '"Good morning! Beautiful weather we\'re having."', '"Hey, welcome in — love that hat."'].map((t, i) => (
            <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: DARK }}>
              <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
            </div>
          ))}
          <div className="text-[10px] font-bold tracking-widest mt-3 mb-2" style={{ color: ORANGE_DARK }}>AVOID</div>
          {['"What brings you in today?" — business question.', '"Can I help you?" — invites "no" 90% of the time.', '"Are you just looking?" — hands them the perfect out.'].map((t, i) => (
            <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: MID }}>
              <span className="absolute left-0" style={{ color: MID }}>✗</span>{t}
            </div>
          ))}
        </div>
      </div>
      
      <Section title="THE QAS MODEL" subtitle="Question about person → Answer theirs → Support bridges value.">
        {[
          { label: 'QUESTION', text: '"What\'s been the best thing this week?"', tone: 'q' },
          { label: 'ANSWER', text: '"I got a promotion!"', tone: 'a' },
          { label: 'SUPPORT', text: '"Congratulations — that\'s huge! Maybe today\'s the day to find something special for the new chapter."', tone: 's' },
        ].map((r, i) => (
          <div key={i} className="rounded-xl p-3 mb-2" style={{ background: r.tone === 's' ? ORANGE_TINT : (r.tone === 'a' ? LIGHT_BG : '#fff'), border: `1px solid ${r.tone === 's' ? ORANGE : BORDER}` }}>
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: r.tone === 's' ? ORANGE_DARK : MID }}>{r.label}</div>
            <div className="text-sm" style={{ color: DARK, fontStyle: r.tone === 'a' ? 'italic' : 'normal' }}>{r.text}</div>
          </div>
        ))}
      </Section>
      
      <Section title="READING REGARD">
        {[
          { level: 'HIGH', see: 'Engages with you and lets you work with them.', how: 'General conversation. Use QAS to deepen. Learn about family, lifestyle.' },
          { level: 'LOW', see: '"I\'m just looking." Pleasant but hesitant.', how: 'Personality + ONE value-add: store layout, price tag, promo, the Ashley story.' },
          { level: 'NO', see: 'No indication of wanting to engage.', how: 'Acknowledge space. Watch for Window of Opportunity. Re-engage in 2 min.' },
        ].map((r, i) => (
          <div key={i} className="mb-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex">
              <div className="w-16 flex items-center justify-center py-3" style={{ background: ORANGE_TINT }}>
                <div className="text-base font-bold" style={{ color: ORANGE_DARK }}>{r.level}</div>
              </div>
              <div className="flex-1 p-3">
                <div className="text-xs font-semibold mb-1" style={{ color: DARK }}>{r.see}</div>
                <div className="text-xs" style={{ color: MID }}>{r.how}</div>
              </div>
            </div>
          </div>
        ))}
      </Section>
      
      <Section title="WINDOW OF OPPORTUNITY" subtitle="Wait at least 2 minutes. Then watch for:">
        {['Guest checking out a price tag.', 'Guest test-driving furniture.', 'Guest interacting with a mechanism.', 'Guest looking around for help.'].map((t, i) => (
          <div key={i} className="flex items-start gap-2 mb-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ORANGE_TINT }}>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{i+1}</div>
            </div>
            <div className="text-sm flex-1" style={{ color: DARK }}>{t}</div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="ENGAGE is not the time to sell. Lead with non-business greeting. Use QAS. Read regard. Trust comes first." />
    </>
  );
}

// ============ ASK & LISTEN CONTENT ============
function AskContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-3" style={{ color: ORANGE_DARK }}>The 5 Whats</div>
          {[
            ['1. WHAT room?', 'Where will it live? How is the space configured?'],
            ['2. WHAT use?', 'Daily? Guests? Kids? Pets? Movie nights?'],
            ['3. WHAT timeframe?', 'Need it now? Three weeks? No rush?'],
            ['4. WHAT works/doesn\'t?', 'What do you have now? What\'s failing?'],
            ['5. WHAT budget signals?', 'Listen for hesitation, comparison, payment talk.'],
          ].map(([n, t], i) => (
            <div key={i} className="mb-2">
              <div className="text-sm font-bold" style={{ color: ORANGE_DARK }}>{n}</div>
              <div className="text-xs" style={{ color: DARK }}>{t}</div>
            </div>
          ))}
        </div>
      </div>
      
      <Section title="OPEN VS. CLOSED">
        {[
          ['Do you want leather?', 'Tell me how you\'ll use this room.'],
          ['Are you the only user?', 'Who else will be using this?'],
          ['Is $1,500 your budget?', 'What were you hoping to invest?'],
          ['Did you like the last one?', 'What worked — and what didn\'t?'],
        ].map(([closed, open], i) => (
          <div key={i} className="grid grid-cols-2 gap-2 mb-2">
            <div className="rounded-lg p-2" style={{ background: LIGHT_BG }}>
              <div className="text-[10px] font-bold mb-0.5" style={{ color: MID }}>AVOID</div>
              <div className="text-xs" style={{ color: MID }}>{closed}</div>
            </div>
            <div className="rounded-lg p-2" style={{ background: ORANGE_TINT }}>
              <div className="text-[10px] font-bold mb-0.5" style={{ color: ORANGE_DARK }}>USE</div>
              <div className="text-xs" style={{ color: DARK }}>{open}</div>
            </div>
          </div>
        ))}
      </Section>
      
      <Section title="ACTIVE LISTENING CYCLE">
        {['Ask the open question.', 'Shut up. Let them finish.', '"So it sounds like..." — repeat back.', 'Dig the next layer: "Tell me more about that."', 'Take notes. Mental or physical.'].map((t, i) => (
          <div key={i} className="flex items-start gap-2 mb-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ORANGE_TINT }}>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{i+1}</div>
            </div>
            <div className="text-sm flex-1" style={{ color: DARK }}>{t}</div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="Talk less. Listen more. The guest tells you exactly what they need — IF you make space for it." />
    </>
  );
}

// ============ SHOW & SOLVE CONTENT ============
function ShowContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>Feature → Benefit → Bridge</div>
          <div className="text-xs mb-3" style={{ color: DARK }}>Every feature gets a benefit and a bridge back to what the guest told you in A&L.</div>
          <div className="space-y-2">
            <div className="rounded-lg p-2" style={{ background: '#fff' }}>
              <div className="text-[10px] font-bold mb-1" style={{ color: ORANGE_DARK }}>FEATURE</div>
              <div className="text-xs italic" style={{ color: DARK }}>"This has Platform Seating Technology — engineered support."</div>
            </div>
            <div className="rounded-lg p-2" style={{ background: '#fff' }}>
              <div className="text-[10px] font-bold mb-1" style={{ color: ORANGE_DARK }}>BENEFIT</div>
              <div className="text-xs italic" style={{ color: DARK }}>"It distributes weight evenly so you won't get sagging spots."</div>
            </div>
            <div className="rounded-lg p-2" style={{ background: '#fff' }}>
              <div className="text-[10px] font-bold mb-1" style={{ color: ORANGE_DARK }}>BRIDGE</div>
              <div className="text-xs italic" style={{ color: DARK }}>"You said the kids destroyed the last one — this is built for that."</div>
            </div>
          </div>
        </div>
      </div>
      
      <Section title="THE TWO-CHOICE SHOW" subtitle="Show 2–3 options, never 10. Frame as comparison.">
        <div className="rounded-xl p-3" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-xs italic" style={{ color: DARK }}>"Based on what you told me, compare these two — they both fit, but they solve it differently."</div>
        </div>
      </Section>
      
      <Section title="WHEN TO PULL THE CALCULATOR">
        {['"That\'s a lot."', '"How much per month?"', '"Can we do it without the [base / Safelock]?"', 'Anything over $1,000.'].map((t, i) => (
          <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: DARK }}>
            <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
          </div>
        ))}
      </Section>
      
      <Section title="STORY SELLING">
        <div className="text-xs mb-3" style={{ color: MID }}>Stories beat specs. Build a small library:</div>
        {['"I had a guest last month with a similar setup — kids, pets..."', '"Funny story — this fabric came back after two years..."', '"You know what\'s wild? The owner has this exact piece."'].map((t, i) => (
          <div key={i} className="rounded-lg p-2 mb-2" style={{ background: LIGHT_BG }}>
            <div className="text-xs italic" style={{ color: DARK }}>{t}</div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="They told you what they need in A&L. Your job in S&S is to point at the thing that solves it. Stop showing — start solving." />
    </>
  );
}

// ============ YES CONTENT ============
function YesContent() {
  const closes = [
    { n: '1', name: 'Assumption', text: '"When would you like delivery?"' },
    { n: '2', name: 'Alternative', text: '"Cash or financing today?"' },
    { n: '3', name: 'Summary', text: 'Recap needs + what you showed + ask.' },
    { n: '4', name: 'Trial', text: '"How does this feel compared to home?"' },
    { n: '5', name: 'Urgency', text: '"This Hot Buy ends Sunday."' },
    { n: '6', name: 'Question', text: '"What questions do you still have?"' },
    { n: '7', name: 'Takeaway', text: '"Maybe this isn\'t the right fit..."' },
    { n: '8', name: 'Story', text: '"I had a guest last month who said the same..."' },
  ];
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The 8 Rock-Solid Closes</div>
          {closes.map(c => (
            <div key={c.n} className="flex gap-3 py-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#fff', color: ORANGE_DARK }}>
                <span className="text-xs font-bold">{c.n}</span>
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold" style={{ color: DARK }}>{c.name}</div>
                <div className="text-xs italic" style={{ color: MID }}>{c.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <Section title="BUYING SIGNALS — your green light">
        {['"How does delivery work?"', '"What are the financing terms?"', '"What does the warranty cover?"', '"How does Safelock work?"', 'Sits on it a second time. Looks at their partner.'].map((t, i) => (
          <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: DARK }}>
            <span className="absolute left-0" style={{ color: ORANGE }}>✓</span>{t}
          </div>
        ))}
      </Section>
      
      <Section title="IF NOT TODAY">
        {['Save the quote in the calculator.', 'Send it before they leave.', 'Set follow-up: "Wednesday morning or afternoon?"', 'Hand them a card + a Rest Test coupon.', 'Add to undelivered/follow-up list.'].map((t, i) => (
          <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: DARK }}>
            <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
          </div>
        ))}
      </Section>
      
      <RememberCard text="Ask. Then shut up. The first one to talk after the close question loses." />
    </>
  );
}

// ============ BEDDING CONTENT ============
function BeddingContent({ revealStore }) {
  const flow = revealStore
    ? [
        ['1. REVEAL SCAN', 'Map their pressure points first. The data drives the pillow + comfort level.'],
        ['2. PILLOW', 'Match scan results. Sets posture for the Rest Test.'],
        ['3. REST TEST', 'Multiple comfort levels. Listen to feedback.'],
        ['4. MATTRESS', 'Match scan + feedback + sleep position.'],
        ['5. ADJUSTABLE BASE', 'Always demo. Show the head and the feet.'],
        ['6. PROTECTION', 'Required for the warranty to stay valid.']
      ]
    : [
        ['1. PILLOW', 'Right pillow first. Sets posture. Improves Rest Test accuracy.'],
        ['2. REST TEST', 'Multiple comfort levels. Listen to feedback.'],
        ['3. MATTRESS', 'Match feedback + sleep position.'],
        ['4. ADJUSTABLE BASE', 'Always demo. Head + feet.'],
        ['5. PROTECTION', 'Required for the warranty to stay valid.']
      ];
  
  return (
    <>
      {revealStore && (
        <div className="px-6 pt-5">
          <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: ORANGE, color: '#fff' }}>
            <Eye size={14} strokeWidth={2.5} />
            <div className="text-xs font-bold tracking-widest">REVEAL-STORE FLOW</div>
          </div>
        </div>
      )}
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Bedding Flow — never skip a step</div>
          {flow.map(([n, t], i) => (
            <div key={i} className="mb-1.5">
              <div className="text-sm font-bold" style={{ color: ORANGE_DARK }}>{n}</div>
              <div className="text-xs" style={{ color: DARK }}>{t}</div>
            </div>
          ))}
        </div>
      </div>
      
      <Section title="BRAND QUICK REFERENCE">
        {[['Tempur-Pedic', 'TEMPUR material. Pressure relief. Premium.'], ['Stearns & Foster', 'Hand-tufted. Luxury hybrid.'], ['Beautyrest', 'T3 Coil. Motion reduction.'], ['Ashley Sleep', 'In-house. Solid value.'], ['Purple', 'Gel grid. Polarizing.'], ['Nectar', 'Memory foam. Long warranty.'], ['Sealy', 'Posturepedic. Entry-level.']].map(([name, desc], i) => (
          <div key={i} className="flex justify-between items-start py-2" style={{ borderBottom: i < 6 ? `1px solid ${BORDER}` : 'none' }}>
            <div className="text-sm font-bold" style={{ color: DARK }}>{name}</div>
            <div className="text-xs text-right ml-3" style={{ color: MID }}>{desc}</div>
          </div>
        ))}
      </Section>
      
      <Section title="OBJECTION SCRIPTS">
        {[['"Too expensive"', 'Pull calculator. Reframe as monthly.'], ['"Don\'t need the base"', '"One demo. Two minutes. If you don\'t love it, we move on."'], ['"Just a mattress"', '"Got it — let me show you the protection. Required for warranty."']].map(([obj, resp], i) => (
          <div key={i} className="rounded-lg p-2 mb-2" style={{ background: LIGHT_BG }}>
            <div className="text-xs font-bold mb-0.5" style={{ color: ORANGE_DARK }}>{obj}</div>
            <div className="text-xs italic" style={{ color: DARK }}>{resp}</div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="Bedding is where your bonus tiers live. Every guest gets the full flow — even 'just a mattress' gets all four offered." />
    </>
  );
}

// ============ SAFELOCK CONTENT ============
function SafelockContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Quick Pitch</div>
          <div className="text-xs italic" style={{ color: DARK }}>"Life happens — kids spill, accidents occur. Safelock protects your furniture for 4 years. One-time cost, no deductible. And if you don't use it, you get full value back as in-store credit."</div>
        </div>
      </div>
      
      <Section title="PRICING">
        <div className="rounded-lg overflow-hidden mb-2" style={{ border: `1px solid ${BORDER}` }}>
          {[['$0 – $800', '$99.99'], ['$801 – $1,200', '$169.99'], ['$1,201+', '14% × pre-tax']].map(([range, price], i) => (
            <div key={i} className="flex justify-between p-2.5" style={{ background: i % 2 ? LIGHT_BG : '#fff', borderBottom: i < 2 ? `1px solid ${BORDER}` : 'none' }}>
              <div className="text-xs" style={{ color: DARK }}>{range}</div>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{price}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-2.5 flex items-start gap-2" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
          <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>RULE</div>
          <div className="text-xs" style={{ color: DARK }}>Every SafeLock price ends in <span className="font-bold">$9.99</span>. Round to the nearest $9.99 — no exceptions.</div>
        </div>
      </Section>
      
      <Section title="QUICK MATH EXAMPLES">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          {[
            ['$700 sofa', '$99.99 ($0–$800 tier)'],
            ['$1,000 sectional', '$169.99 ($801–$1,200 tier)'],
            ['$1,200 bedroom set', '$169.99 (top of flat tier)'],
            ['$1,500 mattress', '$209.99 ($210 → nearest $9.99)'],
            ['$1,800 living room', '$249.99 ($252 → nearest $9.99)'],
            ['$2,000 mattress + base', '$279.99 ($280 → nearest $9.99)'],
            ['$3,000 furniture pkg', '$419.99 ($420 → nearest $9.99)'],
          ].map(([item, price], i) => (
            <div key={i} className="flex justify-between p-2" style={{ background: i % 2 ? LIGHT_BG : '#fff', borderBottom: i < 6 ? `1px solid ${BORDER}` : 'none' }}>
              <div className="text-xs" style={{ color: DARK }}>{item}</div>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{price}</div>
            </div>
          ))}
        </div>
      </Section>
      
      <Section title="WHAT'S COVERED">
        {['Stains: food, drinks, fluids, dye transfer.', 'Tears, rips, burns, punctures.', 'Frame and mechanism failures.', 'Glass and mirror breakage.', 'One-time replacement if not repairable.', 'Multiple service claims allowed.'].map((t, i) => (
          <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: DARK }}>
            <span className="absolute left-0" style={{ color: ORANGE }}>✓</span>{t}
          </div>
        ))}
      </Section>
      
      <Section title="WHAT'S NOT COVERED">
        {['Accumulated damage / general soiling.', 'Pet claw or teeth damage.', 'Acts of God, theft.', 'Foam loss, pilling, fading.', 'Bonded/bi-cast leather peeling.'].map((t, i) => (
          <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: MID }}>
            <span className="absolute left-0" style={{ color: MID }}>✗</span>{t}
          </div>
        ))}
      </Section>
      
      <Section title="YOUR COMMISSION • 20%">
        {[['$99.99', '$20'], ['$169.99', '$34'], ['$279.99', '$56'], ['$419.99', '$84'], ['$699.99', '$140']].map(([price, comm], i) => (
          <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: i < 4 ? `1px solid ${BORDER}` : 'none' }}>
            <div className="text-xs" style={{ color: DARK }}>{price}</div>
            <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{comm}</div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="Every guest gets offered. Every time. There is no losing version of this for the guest." />
    </>
  );
}

// ============ CALC CONTENT ============
function CalcContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <button
          onClick={() => window.open(CALC_URL, '_blank')}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white active:scale-98 transition-transform mb-4 flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)`, boxShadow: '0 8px 24px rgba(243,117,32,0.3)' }}
        >
          <Calculator size={18} /> Open the Calculator
        </button>
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>Pull the calculator the moment you hear:</div>
          {['"That\'s a lot."', '"How much per month?"', '"We\'d have to finance."', 'Anything over $1,000.', 'Closing the sale.'].map((t, i) => (
            <div key={i} className="text-xs mb-1 pl-3 relative" style={{ color: DARK }}>
              <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
            </div>
          ))}
        </div>
      </div>
      
      <Section title="THE BASIC FLOW">
        {['Pull it on iPad or phone.', 'Enter the items.', 'Toggle the finance partner.', 'Walk through screens TOGETHER.', 'Save with name + contact.', 'Send before they leave.'].map((t, i) => (
          <div key={i} className="flex items-start gap-2 mb-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ORANGE_TINT }}>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{i+1}</div>
            </div>
            <div className="text-sm flex-1" style={{ color: DARK }}>{t}</div>
          </div>
        ))}
      </Section>
      
      <Section title="FINANCE PARTNERS">
        {[['Synchrony', 'Strongest approval. Default for typical credit.'], ['Wells Fargo', 'Premium. Longer terms for big tickets.'], ['Affirm', 'Soft pull. Quick approval. Online feel.']].map(([name, when], i) => (
          <div key={i} className="rounded-lg p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
            <div className="text-sm font-bold mb-1" style={{ color: ORANGE_DARK }}>{name}</div>
            <div className="text-xs" style={{ color: DARK }}>{when}</div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="When money comes up, the calculator turns price into payment. Save every quote. Send every quote." />
    </>
  );
}

// ============ MASTER REFERENCE ============
function MasterContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="text-xs" style={{ color: MID }}>The four-step Ashley E.A.S.Y. selling system. Every guest. Every time.</div>
      </div>
      
      {[
        { letter: 'E', name: 'ENGAGE', tagline: 'Build trust in 90 seconds.', time: '1–3 min', what: 'Non-Business Greeting + QAS Model. Read regard (High/Low/No). Re-engage in Window of Opportunity if needed.' },
        { letter: 'A', name: 'ASK & LISTEN', tagline: 'Uncover the real need.', time: '3–7 min', what: 'The 5 Whats: room, use, timeframe, works/doesn\'t, budget signals. Open questions only. Repeat back.' },
        { letter: 'S', name: 'SHOW & SOLVE', tagline: 'Present the fit.', time: '5–15 min', what: 'Feature → Benefit → Bridge. Two-Choice Show. Pull calculator on budget signals. Story selling.' },
        { letter: 'Y', name: 'YES', tagline: 'Ask for the sale.', time: '3–10 min', what: 'Trial close → ask → confirm next steps. 8 Rock-Solid Closes. If "not today": save quote, set follow-up.' },
      ].map((s, i) => (
        <div key={i} className="px-6 mt-5">
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-3 p-3" style={{ background: ORANGE_TINT }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: ORANGE }}>
                <div className="text-2xl font-bold text-white">{s.letter}</div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold" style={{ color: DARK }}>{s.name}</div>
                <div className="text-xs italic" style={{ color: ORANGE_DARK }}>{s.tagline}</div>
              </div>
              <div className="text-[10px] font-bold" style={{ color: MID }}>{s.time}</div>
            </div>
            <div className="p-3 text-xs" style={{ color: DARK, background: '#fff' }}>{s.what}</div>
          </div>
        </div>
      ))}
      
      <div className="px-6 mt-6">
        <div className="rounded-2xl p-4 text-center" style={{ background: DARK }}>
          <div className="text-sm font-bold text-white mb-1">ENGAGE → A&L → S&S → YES</div>
          <div className="text-xs" style={{ color: ORANGE }}>Every guest. Every time.</div>
        </div>
      </div>
    </>
  );
}

// ============ BELIEFS CONTENT ============
function BeliefsContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: ORANGE_DARK }}>VISION</div>
        <div className="text-2xl font-bold italic" style={{ color: DARK }}>To be the best furniture retailer.</div>
      </div>
      
      <div className="px-6 mt-5">
        <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: ORANGE_DARK }}>MISSION — WE WANT TO</div>
        {['Improve the guest experience.', 'Reduce cost.', 'Do more business.', 'Be profitable.', 'Stay in business.'].map((t, i) => (
          <div key={i} className="text-sm font-bold mb-1" style={{ color: DARK }}>• {t}</div>
        ))}
      </div>
      
      <Section title="CORE BELIEFS">
        {[['GOD', 'We anchor what we do in something bigger than ourselves.'], ['DOMINATE OUR MARKET', 'We don\'t aim to compete — we aim to win.'], ['LOCALLY OWNED', 'We are our community.'], ['PEOPLE BUY FROM PEOPLE', 'Product is the reason. Relationship is the close.'], ['SOCIAL RESPONSIBILITY', 'We give back. We do the right thing.'], ['TEAM', 'We win together. Nobody crushes a bonus alone.']].map(([title, body], i) => (
          <div key={i} className="rounded-lg p-3 mb-2" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE_TINT}` }}>
            <div className="text-sm font-bold mb-0.5" style={{ color: ORANGE_DARK }}>{title}</div>
            <div className="text-xs" style={{ color: DARK }}>{body}</div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="Every guest who walks in is a real person with a real reason. Honor that. Treat them like family. Earn the right to do it again." />
    </>
  );
}

// ============ EARNINGS CONTENT ============
function EarningsContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: ORANGE_DARK }}>ASHLEY SALES PROGRESSION</div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[['START', '$0'], ['GOOD', '$900K'], ['GREAT', '$1.25M']].map(([label, val], i) => (
            <div key={i} className="rounded-lg p-3 text-center" style={{ background: i === 2 ? ORANGE_TINT : LIGHT_BG, border: `1px solid ${i === 2 ? ORANGE : BORDER}` }}>
              <div className="text-[10px] font-bold mb-1" style={{ color: ORANGE_DARK }}>{label}</div>
              <div className="text-lg font-bold" style={{ color: DARK }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      
      <Section title="QUARTERLY BONUS TIERS">
        {[['Volume', [['$250K', '$1,000'], ['$275K', '$1,500'], ['$300K+', '$2,500']]], ['Bedding (min $50K)', [['$50–75K', '$500'], ['$75–100K', '$1,000'], ['$100K+', '$2,000']]], ['Safelock %', [['8.0–8.49%', '$500'], ['8.5–9.49%', '$750'], ['9.5%+', '$1,250']]], ['Delivery %', [['5.0–5.74%', '$100'], ['5.75–6.49%', '$250'], ['6.5%+', '$500']]]].map(([title, tiers], i) => (
          <div key={i} className="mb-3">
            <div className="text-xs font-bold mb-1.5" style={{ color: ORANGE_DARK }}>{title}</div>
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              {tiers.map(([range, val], j) => (
                <div key={j} className="flex justify-between p-2" style={{ background: j % 2 ? LIGHT_BG : '#fff', borderBottom: j < tiers.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <div className="text-xs" style={{ color: DARK }}>{range}</div>
                  <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>
      
      <Section title="STACK THE TOP TIERS">
        <div className="rounded-2xl p-3" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
          <div className="text-xs font-bold mb-1" style={{ color: DARK }}>$2,500 + $2,000 + $1,250 + $500</div>
          <div className="text-base font-bold" style={{ color: ORANGE_DARK }}>= $6,250/quarter = $25,000/year</div>
        </div>
      </Section>
      
      <Section title="MILLION DOLLAR WRITER">
        <div className="text-xs mb-2" style={{ color: DARK }}>Hit $1M for the year, your commission rate climbs the next year:</div>
        {[['Year 1', 'Hit $1M', '5.5% / 22.5%'], ['Year 2', 'Hit $1M + grow', '6% / 25%'], ['Year 3', 'Hit $1M + grow', '6.5% / 27.5%']].map(([y, ach, rate], i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5 mb-1.5">
            <div className="rounded-lg p-2 text-center" style={{ background: LIGHT_BG }}>
              <div className="text-[10px] font-bold" style={{ color: ORANGE_DARK }}>{y}</div>
            </div>
            <div className="rounded-lg p-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-[10px]" style={{ color: DARK }}>{ach}</div>
            </div>
            <div className="rounded-lg p-2 text-center" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-[10px] font-bold" style={{ color: ORANGE_DARK }}>{rate}</div>
            </div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="Stack top tiers + Million Dollar Writer = $30K+ extra on top of commission. The math is real." />
    </>
  );
}

// ============ BEDDING CERT ROADMAP ============
function BeddingCertContent({ cert, setCert, trainerMode }) {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="text-xs" style={{ color: MID }}>Two sessions to full certification. Foundations on Day 6. Advanced within 30 days.</div>
      </div>
      
      <Section title="SESSION 1 • FOUNDATIONS (DAY 6)">
        <div className="space-y-1.5">
          {['Bedding category overview + brand introductions.', 'The bedding sales flow: pillow → Rest Test → mattress → base → protection.', 'Adjustable base demo basics.', 'Safelock attachment selling.', 'Hands-on Rest Test practice.'].map((t, i) => (
            <div key={i} className="text-xs pl-3 relative" style={{ color: DARK }}>
              <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg p-3" style={{ background: cert.session1 ? ORANGE_TINT : LIGHT_BG }}>
          {cert.session1 ? (
            <div className="text-xs font-bold flex items-center gap-2" style={{ color: ORANGE_DARK }}>
              <Check size={14} strokeWidth={3} /> Session 1 — Signed Off
            </div>
          ) : (
            <button onClick={() => trainerMode && setCert({ ...cert, session1: true })} disabled={!trainerMode} className="w-full text-xs font-bold disabled:opacity-50" style={{ color: trainerMode ? ORANGE_DARK : MID }}>
              {trainerMode ? 'Tap to sign off Session 1 →' : '🔒 Awaiting trainer sign-off'}
            </button>
          )}
        </div>
      </Section>
      
      <Section title="SESSION 2 • ADVANCED (within 30 days)">
        <div className="space-y-1.5">
          {['In-depth product training, feature/feel comparison.', 'Advanced Rest Test: deep roleplay, objections.', 'Attachment mastery — full ticket building.', 'Advanced closing techniques.', 'Final Rest Test evaluation + sign-off.'].map((t, i) => (
            <div key={i} className="text-xs pl-3 relative" style={{ color: DARK }}>
              <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg p-3" style={{ background: cert.session2 ? ORANGE_TINT : LIGHT_BG }}>
          {cert.session2 ? (
            <div className="text-xs font-bold flex items-center gap-2" style={{ color: ORANGE_DARK }}>
              <Check size={14} strokeWidth={3} /> Session 2 — Fully Certified
            </div>
          ) : (
            <button onClick={() => trainerMode && cert.session1 && setCert({ ...cert, session2: true })} disabled={!trainerMode || !cert.session1} className="w-full text-xs font-bold disabled:opacity-50" style={{ color: trainerMode && cert.session1 ? ORANGE_DARK : MID }}>
              {trainerMode && cert.session1 ? 'Tap to sign off Session 2 →' : '🔒 Awaiting Session 1 + trainer'}
            </button>
          )}
        </div>
      </Section>
      
      <RememberCard text="Bedding has the highest margin. Full cert in 30 days = significantly higher bonus tier hit rates Q1." />
    </>
  );
}

// ============ HOMES POS ============
function PosContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The HOMES Flow</div>
          <div className="text-xs" style={{ color: DARK }}>Same skeleton every ticket. Shaking Hands → customer → sale # → items → delivery → SafeLock → remarks → save.</div>
        </div>
      </div>
      
      <Section title="STEP 1 · SHAKING HANDS">
        <div className="text-xs mb-3" style={{ color: MID }}>Open HOMES from the floor terminal. Click <span className="font-bold" style={{ color: DARK }}>Shaking Hands</span> to start a new ticket.</div>
        <div className="rounded-lg p-3" style={{ background: LIGHT_BG }}>
          <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: MID }}>WHY THIS STEP MATTERS</div>
          <div className="text-xs" style={{ color: DARK }}>Shaking Hands captures the up. If you skip it, the sale doesn't tie back to your point position and you risk losing credit.</div>
        </div>
      </Section>
      
      <Section title="STEP 2 · CUSTOMER">
        <div className="text-xs mb-3" style={{ color: MID }}>Search by phone first. If they're a repeat guest, pull the existing record — never create a duplicate.</div>
        <div className="rounded-lg p-3 mb-2" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
          <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: ORANGE_DARK }}>NEW CUSTOMER ID FORMAT</div>
          <div className="text-xs font-mono" style={{ color: DARK }}>3 digits + LAST + FIRST</div>
          <div className="text-[10px] mt-1" style={{ color: MID }}>Example: <span className="font-mono">555SMITHJOHN</span></div>
        </div>
        <div className="text-xs" style={{ color: MID }}>Required fields before save: name, phone, address, email if you can get it. Email is required for some finance partners.</div>
      </Section>
      
      <Section title="STEP 3 · SALE NUMBER">
        <div className="text-xs" style={{ color: DARK }}>HOMES auto-generates the sale number once the customer is attached. Write it on your worksheet immediately — you'll need it for the calculator and any TO conversations.</div>
      </Section>
      
      <Section title="STEP 4 · ITEM ENTRY">
        <div className="text-xs mb-3" style={{ color: MID }}>Pull the SKU from the tag, not from memory. Wrong SKU = wrong fulfillment.</div>
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          <div className="px-3 py-2 flex justify-between" style={{ background: LIGHT_BG, borderBottom: `1px solid ${BORDER}` }}>
            <div className="text-[10px] font-bold tracking-widest" style={{ color: MID }}>ITEM TYPE</div>
            <div className="text-[10px] font-bold tracking-widest" style={{ color: MID }}>HOMES CODE</div>
          </div>
          {[
            ['Furniture', 'SKU from tag'],
            ['Mattress', 'M-prefix SKU'],
            ['Delivery', 'DELIVERY'],
            ['SafeLock', 'SAFELOCK'],
            ['SafeLock Kit', 'SAFELOCKKIT'],
            ['Mattress Pads', 'MATTPADS'],
            ['Mattress Removal', 'MATTREMOVE'],
          ].map(([type, code], i, a) => (
            <div key={i} className="px-3 py-2 flex justify-between" style={{ background: i % 2 ? LIGHT_BG : '#fff', borderBottom: i < a.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
              <div className="text-xs" style={{ color: DARK }}>{type}</div>
              <div className="text-xs font-mono font-bold" style={{ color: ORANGE_DARK }}>{code}</div>
            </div>
          ))}
        </div>
      </Section>
      
      <Section title="STEP 5 · DELIVERY">
        <div className="text-xs mb-2" style={{ color: DARK }}>Add as a separate line. Pick zone (Local / Outer Area / Threshold) and the system pulls the price.</div>
        <div className="text-[10px]" style={{ color: MID }}>If picking up: skip this line entirely. Don't enter delivery as $0.</div>
      </Section>
      
      <Section title="STEP 6 · SAFELOCK">
        <div className="text-xs mb-2" style={{ color: DARK }}>Add as a separate non-taxed line. Use SAFELOCK for the protection plan; SAFELOCKKIT if applicable.</div>
        <div className="rounded-lg p-2.5" style={{ background: ORANGE_TINT }}>
          <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: ORANGE_DARK }}>PRICING (auto-calc — verify)</div>
          <div className="text-xs" style={{ color: DARK }}>$0–$800: $99.99 · $801–$1,200: $169.99 · $1,201+: 14% rounded to nearest $9.99</div>
        </div>
      </Section>
      
      <Section title="STEP 7 · SALES REMARKS">
        <div className="text-xs mb-3" style={{ color: MID }}>Format every remark consistently. This is what fulfillment, delivery, and customer service read.</div>
        <div className="rounded-lg p-3 font-mono text-[11px] mb-2" style={{ background: LIGHT_BG, color: DARK }}>
          <div>SOLD BY: [your name]</div>
          <div>UP: [point # / be-back / phone / web]</div>
          <div>DEL: [date or "PICKUP"]</div>
          <div>NOTES: [special instructions, color matches, hold reasons]</div>
        </div>
        <div className="text-[10px]" style={{ color: MID }}>If special order, note manufacturer ETA. If holding for delivery date change, note the original schedule.</div>
      </Section>
      
      <Section title="STEP 8 · READ-BACK & SAVE">
        <div className="text-xs mb-2" style={{ color: DARK }}>Read every ticket back to the guest before you save:</div>
        {['"You\'re getting [list pieces]."', '"SafeLock 4-year protection is included."', '"Delivery is [date] for $[fee] — bring in, set up, haul away."', '"Total today is $[X]. Financed at $[Y]/mo for [Z] months."', '"Anything I should change before I save?"'].map((t, i) => (
          <div key={i} className="text-xs mb-1.5 pl-3 relative italic" style={{ color: DARK }}>
            <span className="absolute left-0 not-italic" style={{ color: ORANGE }}>•</span>{t}
          </div>
        ))}
      </Section>
      
      <Section title="COMMON MISTAKES">
        {[
          ['Duplicate customer record', 'Always search by phone first. A duplicate kills follow-up tracking.'],
          ['Wrong SKU from memory', 'Pull from the tag. Memory is wrong about 1 in 8 SKUs.'],
          ['SafeLock taxed', 'It shouldn\'t be — verify before save.'],
          ['Delivery date assumed', 'Confirm a specific date in the read-back.'],
          ['Empty remarks', 'Fulfillment needs the SOLD BY / UP / DEL / NOTES format every time.'],
        ].map(([m, t], i) => (
          <div key={i} className="rounded-lg p-2 mb-2" style={{ background: LIGHT_BG }}>
            <div className="text-xs font-bold mb-0.5" style={{ color: ORANGE_DARK }}>{m}</div>
            <div className="text-xs" style={{ color: DARK }}>{t}</div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="Same flow every ticket. Read it back before save. Catch the error before fulfillment does." />
    </>
  );
}

// ============ DELIVERY PITCH ============
function DeliveryContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Pitch</div>
          <div className="text-xs italic" style={{ color: DARK }}>"We deliver Tuesday or Thursday. We bring it in, set it up, take the trash. Which day works better for you?"</div>
        </div>
      </div>
      
      <Section title="WHY IT MATTERS">
        {[
          ['Bonus tier', '5% delivery floor. 6.5%+ tops the tier — $500/quarter.'],
          ['Guest experience', 'A sectional in pieces in the back of a pickup is not a guest win.'],
          ['Margin protection', 'Delivery revenue counts toward your 53% margin floor.'],
          ['Trust signal', 'Pros deliver. Walk-out pickup feels like furniture you assemble yourself.'],
        ].map(([w, t], i) => (
          <div key={i} className="rounded-lg p-2 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
            <div className="text-xs font-bold mb-0.5" style={{ color: ORANGE_DARK }}>{w}</div>
            <div className="text-xs" style={{ color: DARK }}>{t}</div>
          </div>
        ))}
      </Section>
      
      <Section title="HOW TO PITCH IT">
        {[
          'Bring it up after the close, not before. Make it routine.',
          'Frame as a choice between two days, not yes/no.',
          'Mention what\'s included: bring in, set up, haul away the old one.',
          'Use the calculator to show the monthly difference — usually small.',
        ].map((t, i) => (
          <div key={i} className="flex items-start gap-2 mb-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ORANGE_TINT }}>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{i+1}</div>
            </div>
            <div className="text-sm flex-1" style={{ color: DARK }}>{t}</div>
          </div>
        ))}
      </Section>
      
      <Section title="OBJECTION SCRIPTS">
        {[
          ['"I\'ll just pick it up."', '"Sure — though for $X delivered, we bring it in, set it up, and take the trash. Want me to add that?"'],
          ['"It\'s too expensive to deliver."', 'Pull the calculator. Show the monthly difference. Usually $5–$10/month.'],
          ['"I have a truck."', '"Got it. Just so you know, the sectional is [N] boxes — does your truck handle that and do you have help on the other end?"'],
          ['"I\'ll come back for it later."', '"We can hold it 7 days. After that we restock. Want me to schedule delivery instead so it\'s yours for sure?"'],
        ].map(([obj, resp], i) => (
          <div key={i} className="rounded-lg p-2 mb-2" style={{ background: LIGHT_BG }}>
            <div className="text-xs font-bold mb-0.5" style={{ color: ORANGE_DARK }}>{obj}</div>
            <div className="text-xs italic" style={{ color: DARK }}>{resp}</div>
          </div>
        ))}
      </Section>
      
      <Section title="THE BONUS MATH">
        <div className="rounded-2xl p-3" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
          <div className="text-xs mb-2" style={{ color: DARK }}>Quarterly delivery tier on $250K written:</div>
          <div className="grid grid-cols-3 gap-2">
            {[['5.0%+', '$100'], ['5.75%+', '$250'], ['6.5%+', '$500']].map(([pct, val], i) => (
              <div key={i} className="rounded-lg p-2 text-center" style={{ background: '#fff' }}>
                <div className="text-[10px] font-bold" style={{ color: MID }}>{pct}</div>
                <div className="text-base font-bold" style={{ color: ORANGE_DARK }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>
      
      <RememberCard text="Delivery isn't optional — it's routine. Pick a day, not yes/no. Make it part of the close, every time." />
    </>
  );
}

// ============ OBJECTIONS LIBRARY ============
function ObjectionsContent() {
  const [open, setOpen] = useState(0);
  
  const objections = [
    {
      cat: 'Price',
      tag: '"Too expensive" / "More than I wanted"',
      moves: [
        ['Value', 'Lead with quality and durability. Tie back to what they told you in A&L.'],
        ['Calculator', 'Pull it. Reframe sticker as monthly. Payment is always easier to say yes to than total.'],
        ['Promotions', 'Check current offers — Hot Buys, scratch card, manager\'s special.'],
      ],
    },
    {
      cat: 'Quality Doubts',
      tag: '"Will this hold up?" / "Is it worth it?"',
      moves: [
        ['Materials', 'Detail the construction — frame, foam density, fabric grade.'],
        ['Reviews', 'Share what other guests have said. Story-sell from your own delivered guests.'],
        ['Compare', 'Walk them to a similar piece at a different price point. Let them feel the difference.'],
      ],
    },
    {
      cat: 'Style & Design',
      tag: '"Not quite my style" / "Not sure about the look"',
      moves: [
        ['Alternatives', 'Show other styles you have in the same category. Don\'t argue the current one.'],
        ['Design tips', 'Offer guidance — what pairs with their existing pieces, color theory, scale.'],
        ['Visual aids', 'Pull room-scene photos, swatches, the bedding gallery if applicable.'],
      ],
    },
    {
      cat: 'Size & Fit',
      tag: '"Will it fit?" / "Is it big enough?"',
      moves: [
        ['Measure with them', 'Tape measure in hand. Help them visualize.'],
        ['Sketch the room', 'Quick paper sketch — door, walls, existing pieces, the new piece.'],
        ['Layout tools', 'Use store layout aids and modular models if you have them.'],
      ],
    },
    {
      cat: 'Functionality',
      tag: '"Does it do what I need?" / "Will it work for us?"',
      moves: [
        ['Match features', 'Tie features to what they told you they need. F → B → Bridge.'],
        ['Lifestyle scenarios', 'Walk through how they\'ll actually use it daily.'],
        ['Demo', 'Show the recliner mechanism, the sleeper, the storage. Hands-on changes minds.'],
      ],
    },
    {
      cat: 'Delivery & Assembly',
      tag: '"How does delivery work?" / "Who sets it up?"',
      moves: [
        ['Service', 'Explain scheduling — date options, window, what to expect at the door.'],
        ['Assembly', 'Yes, we set it up. Bring it in, place it, take the trash.'],
        ['Guarantees', 'Professional crew, insured, will protect floors and walls.'],
      ],
    },
    {
      cat: 'Brand or Store Loyalty',
      tag: '"I usually shop somewhere else"',
      moves: [
        ['Unique selling', 'Family-owned. Not corporate. Over 100 years in business. We\'re here for the long haul.'],
        ['Comparative advantage', '4-year SafeLock protection. Don\'t use it / don\'t lose it — full credit back.'],
        ['Special offers', 'Long-term financing, exclusive deals, the kind of pricing big-box can\'t match.'],
      ],
    },
    {
      cat: 'Timing',
      tag: '"Not right now" / "Need to wait"',
      moves: [
        ['Follow-up', 'Set a specific time to circle back. Save the quote.'],
        ['Limited offer', 'Be honest about real promo windows — never fake urgency.'],
        ['Information', 'Send them home with what they need to decide. Card, quote, contact.'],
      ],
    },
    {
      cat: 'Previous Experience',
      tag: '"Last time was bad" / "I had issues with Ashley before"',
      moves: [
        ['Reassure', 'We are not the same company as other Ashley stores. Family-owned, locally operated.'],
        ['Customer service', 'Highlight the team and process here. Walk them to the office if needed.'],
        ['Resolve specifics', 'Address the actual issue from last time. Don\'t generalize.'],
      ],
    },
    {
      cat: 'Decision Pressure',
      tag: '"I need to think" / "I need my partner"',
      moves: [
        ['No pressure', 'Reassure them. Try to set an appointment for the return visit.'],
        ['Summary', 'Recap key points so they remember the right things later.'],
        ['Follow-up', 'Offer to answer questions by phone, text, or email.'],
      ],
    },
  ];
  
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Move</div>
          <div className="text-xs" style={{ color: DARK }}>Listen first. Acknowledge it. Then respond. Don't argue — solve.</div>
        </div>
      </div>
      
      <Section title="TAP TO EXPAND">
        {objections.map((o, i) => (
          <div key={i} className="rounded-xl mb-2 overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
            <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full px-3 py-3 flex items-center justify-between text-left">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold" style={{ color: DARK }}>{o.cat}</div>
                <div className="text-[10px] italic mt-0.5" style={{ color: MID }}>{o.tag}</div>
              </div>
              <div className="text-base ml-2" style={{ color: ORANGE_DARK }}>{open === i ? '−' : '+'}</div>
            </button>
            {open === i && (
              <div className="px-3 pb-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                {o.moves.map(([label, txt], j) => (
                  <div key={j} className="mt-2.5">
                    <div className="text-[10px] font-bold tracking-widest" style={{ color: ORANGE_DARK }}>{label}</div>
                    <div className="text-xs" style={{ color: DARK }}>{txt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </Section>
      
      <Section title="THE 4-STEP RESPONSE">
        {[
          ['LISTEN', 'Full attention. No interrupting. Let them finish.'],
          ['ACKNOWLEDGE', '"I hear you." / "That makes sense." Show you got it.'],
          ['RESPOND', 'Use one of the moves above. Be factual, not defensive.'],
          ['CHECK', '"Does that address what you were asking?" — confirm before moving on.'],
        ].map(([s, t], i) => (
          <div key={i} className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ORANGE }}>
              <div className="text-[10px] font-bold text-white">{i+1}</div>
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold" style={{ color: DARK }}>{s}</div>
              <div className="text-[11px]" style={{ color: MID }}>{t}</div>
            </div>
          </div>
        ))}
      </Section>
      
      <RememberCard text="Most lost sales are lost to objections RSAs didn't address — not objections that couldn't be answered. Listen, acknowledge, respond, confirm." />
    </>
  );
}

// ============ THE UP BOARD ============
function UpBoardContent() {
  const [tab, setTab] = useState('rules'); // rules | portal
  
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-full p-1 flex" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <button onClick={() => setTab('rules')} className="flex-1 py-2 rounded-full text-xs font-bold transition-all" style={{ background: tab === 'rules' ? ORANGE : 'transparent', color: tab === 'rules' ? '#fff' : MID }}>The Rules</button>
          <button onClick={() => setTab('portal')} className="flex-1 py-2 rounded-full text-xs font-bold transition-all" style={{ background: tab === 'portal' ? ORANGE : 'transparent', color: tab === 'portal' ? '#fff' : MID }}>The Portal</button>
        </div>
      </div>
      
      {tab === 'rules' && (
        <>
          <div className="px-6 pt-4">
            <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
              <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Code</div>
              <div className="text-xs" style={{ color: DARK }}>Fairness, respect, integrity. Sales crashing is prohibited. Treat each guest with care, each teammate with respect.</div>
            </div>
          </div>
          
          <Section title="POINT POSITION">
            <Bullets items={[
              'First on the board manages the greeter board. If you\'re NOT point, don\'t hover at the entryway.',
              'Confirm 2nd and 3rd are in their assigned spots.',
              'When you take point: walkie-check the up board. Verify the previous up was logged with the right guest count (kids don\'t count).',
            ]} />
          </Section>
          
          <Section title="HANDLING RETURN GUESTS">
            <div className="rounded-lg p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>Same-Day Return</div>
              <div className="text-xs" style={{ color: DARK }}>NOT an extra up. Log the original salesperson back out.</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>Previous-Day Return</div>
              <div className="text-xs" style={{ color: DARK }}>This IS an up. Mark accordingly.</div>
            </div>
          </Section>
          
          <Section title="GUESTS WHO DON'T COUNT AS YOUR UP">
            <Bullets items={[
              'Asking for items we don\'t carry (appliances, electronics, baby furniture)',
              'Office visits',
              'Store pickups',
              'These all get logged as ups for BC HOUSE — not for you on point.',
              'EXCEPTION: if an office visit guest then needs a salesperson, the current up takes over.',
            ]} />
          </Section>
          
          <Section title="LANGUAGE BARRIERS">
            <div className="text-xs" style={{ color: DARK }}>If point doesn\'t speak the guest\'s language, the guest goes to the next salesperson who does. If no one speaks it, use every resource — translation app, phone interpreter, asking around.</div>
          </Section>
          
          <Section title="POSITIONING & REPOSITIONING">
            <Bullets items={[
              'On the board but not on point? If another salesperson needs to greet, you move to the bottom of the list. Communicate.',
              'After your guest leaves: log the up FIRST (name, phone, notes, sold/not), THEN put your name back on the board.',
            ]} />
          </Section>
          
          <Section title="PHONE OPPORTUNITIES">
            <div className="text-xs" style={{ color: DARK }}>First salesperson (not with a guest) to walk an extension and accept the call gets it. Phone calls are sales — treat them that way.</div>
          </Section>
          
          <Section title="GUEST REQUESTS A SPECIFIC SALESPERSON">
            <div className="rounded-lg p-3" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-xs mb-1.5" style={{ color: DARK }}><span className="font-bold">If they\'re available:</span> Turn the guest over. You stay at point.</div>
              <div className="text-xs" style={{ color: DARK }}><span className="font-bold">If they\'re NOT available:</span> Next on the board assists. Original RSA gets full credit ONLY if it closes as their saved quote with no changes. Management does NOT split sales.</div>
            </div>
          </Section>
          
          <Section title="WHAT IS PROHIBITED">
            <div className="rounded-2xl p-3" style={{ background: '#FFEAEA', border: `1px solid ${RED}` }}>
              <div className="text-xs font-bold mb-1" style={{ color: RED }}>SALES CRASHING</div>
              <div className="text-xs" style={{ color: DARK }}>Don\'t approach a guest already with a salesperson. Don\'t position to disrupt an ongoing sale. Don\'t use carding to claim a sale. Period.</div>
            </div>
          </Section>
        </>
      )}
      
      {tab === 'portal' && (
        <>
          <div className="px-6 pt-4">
            <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
              <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>Greeter Portal — every shift</div>
              <div className="text-xs" style={{ color: DARK }}>Log in. Take ups. Mark guests. Close out. Get back on the board.</div>
            </div>
          </div>
          
          <Section title="LOGGING IN">
            <PortalStep n="1" t="Open the Portal." d="Far left side: select GREETER." />
            <PortalStep n="2" t="Open the Up Board." d="Drop-down → UP BOARD. Confirm location is YOUR store at the top (it defaults to Bay City)." />
            <PortalStep n="3" t="Log yourself in." d="Find your name in NOT LOGGED IN. Tap LOG IN. Your name moves to the AVAILABLE box in order of arrival." last />
          </Section>
          
          <Section title="TAKING THE UP">
            <PortalStep n="1" t="Select yourself." d="Before you leave the desk." />
            <PortalStep n="2" t="LOG UP IN." d="Right side. Enter the number of guests (kids don't count). Click SUBMIT." />
            <PortalStep n="3" t="Your name moves." d="To the W/ GUEST middle box on the left." />
            <PortalStep n="4" t="Office visit / pickup?" d="Select BC HOUSE. Then in LOG UP IN, select OFFICE VISIT at the top." last />
          </Section>
          
          <Section title="CLOSING OUT THE UP">
            <PortalStep n="1" t="Don't go back on the board yet." d="Log the guest info FIRST." />
            <PortalStep n="2" t="Highlight your name." d="Click the BLUE number under W/ GUEST." />
            <PortalStep n="3" t="ADD/EDIT — twice." d="Scroll to the bottom. Click ADD/EDIT. Scroll again, ADD/EDIT again." />
            <PortalStep n="4" t="Pick the guest picture(s)." d="Match the look so future ups can recognize them." />
            <PortalStep n="5" t="CONTACT INFO tab." d="Required: NAME and PHONE. Strongly recommend: email, address, what they were looking at." />
            <PortalStep n="6" t="Select SOLD or NOT SOLD." d="Mark BEBACK if applicable." />
            <PortalStep n="7" t="SAVE → RED X." d="Returns to the main screen. Your name is now at the bottom of the list. Ready for the next up." last />
          </Section>
          
          <Section title="WHAT GETS LOGGED — EVERY TIME">
            <Bullets items={[
              'Name (required)',
              'Phone (required)',
              'Email when you can get it',
              'Brief note: what they were looking at',
              'SOLD or NOT SOLD',
              'BEBACK flag if they said they\'d return',
            ]} />
          </Section>
        </>
      )}
      
      <RememberCard text="The Up Board is fairness on the floor. Take your turn. Log it clean. Never crash a sale. Trust comes from doing it right every time." />
    </>
  );
}

function PortalStep({ n, t, d, last }) {
  return (
    <div className="flex gap-3 mb-3" style={{ paddingBottom: last ? 0 : '4px' }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: ORANGE }}>
        <div className="text-[10px] font-bold text-white">{n}</div>
      </div>
      <div className="flex-1">
        <div className="text-xs font-bold" style={{ color: DARK }}>{t}</div>
        <div className="text-[11px]" style={{ color: MID }}>{d}</div>
      </div>
    </div>
  );
}

function Bullets({ items }) {
  return (
    <>
      {items.map((t, i) => (
        <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: DARK }}>
          <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
        </div>
      ))}
    </>
  );
}

// ============ FINANCE PARTNER PICKER ============
function FinancePartnerContent() {
  const [activePartner, setActivePartner] = useState(null);
  
  const partners = [
    { id: 'wf', name: 'Wells Fargo', type: '0% interest available', best: 'Premium tier. Existing WF customers. Big tickets needing longer terms.', apply: 'Tablet · Send link · Scan QR', req: '18+ · SS# or ITIN', email: 'Yes', min: '$40/month', down: 'Yes if monthly min met', fees: 'None', earlyOut: 'Yes', combine: 'Yes', partial: 'Yes', billing: 'Paper · Online · Phone' },
    { id: 'nws', name: 'NW Synchrony', type: '0% interest available', best: 'Strong default for typical credit.', apply: 'Tablet · Send link · Scan QR', req: '18+ · SS# or ITIN', email: 'No', min: '$25/month', down: 'Yes if monthly min met', fees: 'None', earlyOut: 'Yes', combine: 'Yes', partial: 'Yes', billing: '1st bill mailed · paper fee after · App · Online · Phone' },
    { id: 'as', name: 'Ashley Synchrony', type: '0% interest available', best: 'Default for typical credit. Ashley brand promos.', apply: 'Tablet · Send · Scan QR', req: '18+ · SS# or ITIN', email: 'No', min: '$25/month', down: 'Yes if monthly min met', fees: 'None', earlyOut: 'Yes', combine: 'Yes', partial: 'Yes', billing: '1st bill mailed · paper fee after · App · Online · Phone' },
    { id: 'prog', name: 'Progressive', type: 'Lease to own', best: 'Guests with thin/no credit. Need a path to ownership.', apply: 'Text · Email', req: '18+ · SS# or ITIN · Check acct # · Routing # · Credit/debit card', email: 'No', min: '$300 purchase', down: 'No — must do separate sale for outright items', fees: '$49 + tax · $53.04 processing if credit/debit online', earlyOut: '90 days cash price + tax/fees', combine: 'Must be on a separate sale', partial: 'No', billing: 'Autodraft on payday' },
    { id: 'conc', name: 'Concora', type: '0% interest available', best: 'Solid mid-tier alternative. Tax & delivery can be down payment.', apply: 'Tablet', req: '18+ · SS# or ITIN', email: 'No', min: 'No minimum', down: 'Yes — taxes and delivery', fees: 'None unless specified', earlyOut: 'Yes', combine: 'Yes', partial: 'Yes', billing: 'Autodraft on payday' },
    { id: 'snap', name: 'Snap', type: 'Lease to own', best: 'Backup LTO when Progressive declines.', apply: 'Text · Email · Scan QR', req: '18+ · $750+/mo income · Check acct # · Routing #', email: 'Yes', min: '$250 purchase', down: 'No — separate sale needed', fees: '$39 in-person processing (cash or credit/debit)', earlyOut: '100 days cash price + tax/fees', combine: 'Must be on a separate sale', partial: 'No', billing: 'Autodraft on payday' },
    { id: 'acima', name: 'Acima', type: 'Lease to own', best: 'Another LTO option. Stricter job-history req.', apply: 'Text · Email · Scan QR', req: '18+ · $750+/mo income · 3-mo job history · SS# or ITIN', email: 'No', min: '$300 purchase', down: 'No — separate sale needed', fees: '$49 + tax toward balance · credit/debit online', earlyOut: '90 days cash price + tax/fees', combine: 'Must be on a separate sale', partial: 'No', billing: 'Autodraft on payday' },
    { id: 'koal', name: 'Koalafi', type: 'Lease to own', best: 'Lower minimum purchase. LTO fallback option.', apply: 'Text · Email · Scan QR', req: '18+ · SS# or ITIN · Check acct # · Routing # · Credit/debit', email: 'No', min: '$200 purchase', down: 'No — separate sale needed', fees: '$49 + tax toward 1st pymt · debit online', earlyOut: '90 days cash price + tax/fees', combine: 'Must be on a separate sale', partial: 'No', billing: 'Autodraft on payday' },
  ];
  
  const groups = [
    { label: '0% INTEREST', ids: ['wf', 'nws', 'as', 'conc'], color: ORANGE_DARK },
    { label: 'LEASE TO OWN', ids: ['prog', 'snap', 'acima', 'koal'], color: MID },
  ];
  
  if (activePartner) {
    const p = partners.find(x => x.id === activePartner);
    return (
      <>
        <div className="px-6 pt-4">
          <button onClick={() => setActivePartner(null)} className="flex items-center gap-1 text-xs font-bold" style={{ color: ORANGE_DARK }}>
            <ArrowLeft size={14} /> All partners
          </button>
        </div>
        <Section title={p.name.toUpperCase()}>
          <div className="rounded-lg p-3 mb-3" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: ORANGE_DARK }}>BEST FOR</div>
            <div className="text-xs" style={{ color: DARK }}>{p.best}</div>
          </div>
          {[
            ['Type', p.type],
            ['Apply', p.apply],
            ['Requirements', p.req],
            ['ID', 'Yes'],
            ['Email needed?', p.email],
            ['Minimum', p.min],
            ['Down Payment', p.down],
            ['Fees', p.fees],
            ['Early Payout', p.earlyOut],
            ['Combine With Other', p.combine],
            ['Partial Fund', p.partial],
            ['Billing', p.billing],
          ].map(([k, v], i, a) => (
            <div key={i} className="flex justify-between py-2 gap-3" style={{ borderBottom: i < a.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
              <div className="text-xs flex-shrink-0 w-28" style={{ color: MID }}>{k}</div>
              <div className="text-xs text-right flex-1" style={{ color: DARK }}>{v}</div>
            </div>
          ))}
        </Section>
      </>
    );
  }
  
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-1" style={{ color: ORANGE_DARK }}>How to Pick</div>
          <div className="text-xs" style={{ color: DARK }}>Lead with 0% if their credit is typical — Synchrony or Wells Fargo. If they need a path with thin/no credit — Progressive first, Snap or Acima as backup.</div>
        </div>
      </div>
      
      {groups.map((g, gi) => (
        <Section key={gi} title={g.label}>
          {partners.filter(p => g.ids.includes(p.id)).map((p, i, a) => (
            <button key={p.id} onClick={() => setActivePartner(p.id)} className="w-full rounded-xl mb-2 flex items-center justify-between p-3 text-left" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold" style={{ color: DARK }}>{p.name}</div>
                <div className="text-[10px] mt-0.5" style={{ color: MID }}>{p.best}</div>
              </div>
              <ChevronRight size={16} style={{ color: ORANGE_DARK }} />
            </button>
          ))}
        </Section>
      ))}
      
      <Section title="THE QUICK PICK">
        <div className="rounded-lg p-3" style={{ background: LIGHT_BG }}>
          <div className="text-xs mb-2" style={{ color: DARK }}><span className="font-bold">Typical credit, big ticket?</span> Wells Fargo.</div>
          <div className="text-xs mb-2" style={{ color: DARK }}><span className="font-bold">Typical credit, regular ticket?</span> Synchrony (NW or Ashley).</div>
          <div className="text-xs mb-2" style={{ color: DARK }}><span className="font-bold">Tax & delivery as down payment?</span> Concora.</div>
          <div className="text-xs mb-2" style={{ color: DARK }}><span className="font-bold">No credit / declined?</span> Progressive first. Snap or Acima as backup.</div>
          <div className="text-xs" style={{ color: DARK }}><span className="font-bold">Smaller ticket, LTO?</span> Koalafi ($200 min).</div>
        </div>
      </Section>
      
      <RememberCard text="Eight options means everyone leaves with a path. Match the partner to the guest — never the other way around." />
    </>
  );
}

// ============ 4-SQUARE FINANCING ============
function FourSquareContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Tool</div>
          <div className="text-xs" style={{ color: DARK }}>Four boxes side-by-side. Show the guest every option at once. Let them pick — but they\'ll almost always pick one of the promo boxes.</div>
        </div>
      </div>
      
      <Section title="THE FOUR BOXES">
        {[
          ['STANDARD', 'Tag price as-is. SafeLock at 14%. Delivery + tax. Total = OTD price.'],
          ['12 MO 0% INTEREST', 'Sale price (10% off). SafeLock at 14% of sale price. Total ÷ 12 = monthly.'],
          ['60 MO 0% (20% DOWN)', 'Sale price (10% off). SafeLock at 14% of sale price. (Total − 20%) ÷ 60 = monthly.'],
          ['MANAGER\'S SPECIAL', 'Custom math, price-match notes, scratch deals.'],
        ].map(([n, t], i) => (
          <div key={i} className="rounded-lg p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
            <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>{n}</div>
            <div className="text-[11px]" style={{ color: DARK }}>{t}</div>
          </div>
        ))}
      </Section>
      
      <Section title="THE MATH (FILL EACH BOX SAME WAY)">
        <PortalStep n="1" t="Model number + price" d="Each item line. Add for the merchandise total." />
        <PortalStep n="2" t="Sale price = Tag × 0.90" d="(10% off) — only in the promo boxes." />
        <PortalStep n="3" t="SafeLock = 14% of price in that box" d="Round to nearest $9.99. Min $99.99 ($0–$800). $169.99 in the $801–$1,200 tier." />
        <PortalStep n="4" t="Delivery = $149.99" d="Local zone. Outer area $179.99. Threshold $129.99/$149.99." />
        <PortalStep n="5" t="Tax" d="On merchandise only. 8.25%. NOT on SafeLock or delivery." />
        <PortalStep n="6" t="12 MO payment = Total ÷ 12" d="Show monthly. Always cleaner than total." />
        <PortalStep n="7" t="60 MO payment = (Total − 20%) ÷ 60" d="The 20% comes off as down payment." last />
      </Section>
      
      <Section title="REVERSE MATH (BACKWARDS FROM OTD)">
        <div className="rounded-lg p-3" style={{ background: LIGHT_BG }}>
          <div className="text-xs font-mono" style={{ color: DARK }}>Subtotal = (OTD − Delivery − SafeLock) ÷ (1 + Tax Rate)</div>
          <div className="text-[10px] mt-2" style={{ color: MID }}>If guest says "I want $3,500 out the door," back the math out to find what merchandise total fits.</div>
        </div>
      </Section>
      
      <Section title="HOW TO PRESENT IT">
        <Bullets items={[
          'Don\'t hand it over — guide them through it. You hold the pen.',
          'Build STANDARD first. Anchor the highest number.',
          'Then 12 MO. Watch the relief on their face.',
          'Then 60 MO. The monthly drops further.',
          'Manager\'s box = your move if they need a nudge. Walk to TO if you need approval.',
          'Circle the box you recommend. Hand them the worksheet to keep.',
        ]} />
      </Section>
      
      <RememberCard text="The 4-Square turns 'how much?' into 'which option?' — and that\'s a much better question." />
    </>
  );
}

// ============ RSA MATH ============
function RsaMathContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Big Four</div>
          <div className="text-xs" style={{ color: DARK }}>Tax, discount, SafeLock, payment. Get fluent in these and you\'ll never lose a beat at the worksheet.</div>
        </div>
      </div>
      
      <Section title="1 · TAX">
        <div className="rounded-lg p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>Rule</div>
          <div className="text-xs" style={{ color: DARK }}>Tax is 8.25% on <span className="font-bold">merchandise only</span>. NOT on SafeLock. NOT on delivery.</div>
        </div>
        <div className="rounded-lg p-3" style={{ background: LIGHT_BG }}>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>EXAMPLES</div>
          {[
            ['$1,500 merch × 0.0825', '$123.75'],
            ['$2,000 merch × 0.0825', '$165.00'],
            ['$3,000 merch × 0.0825', '$247.50'],
          ].map(([calc, ans], i) => (
            <div key={i} className="flex justify-between py-1">
              <div className="text-xs font-mono" style={{ color: DARK }}>{calc}</div>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>= {ans}</div>
            </div>
          ))}
        </div>
      </Section>
      
      <Section title="2 · DISCOUNTS">
        <div className="rounded-lg p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>Rule</div>
          <div className="text-xs" style={{ color: DARK }}>Discount comes off subtotal BEFORE tax. New subtotal = Tag × (1 − discount).</div>
        </div>
        <div className="rounded-lg p-3" style={{ background: LIGHT_BG }}>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>EXAMPLES</div>
          {[
            ['$2,000 × 0.90 (10% off)', '$1,800'],
            ['$2,000 × 0.95 (5% scratch)', '$1,900'],
            ['$2,000 × 0.80 (20% off)', '$1,600'],
          ].map(([calc, ans], i) => (
            <div key={i} className="flex justify-between py-1">
              <div className="text-xs font-mono" style={{ color: DARK }}>{calc}</div>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>= {ans}</div>
            </div>
          ))}
        </div>
      </Section>
      
      <Section title="3 · SAFELOCK">
        <div className="rounded-lg p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>Rule</div>
          <div className="text-xs" style={{ color: DARK }}>$0–$800 = $99.99. $801–$1,200 = $169.99. $1,201+ = 14% rounded to nearest $9.99.</div>
        </div>
        <div className="rounded-lg p-3" style={{ background: LIGHT_BG }}>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>QUICK LOOKUPS</div>
          {[
            ['$700', '$99.99'],
            ['$1,000', '$169.99'],
            ['$1,500 (× 0.14 = $210)', '$209.99'],
            ['$1,800 (× 0.14 = $252)', '$249.99'],
            ['$2,500 (× 0.14 = $350)', '$349.99'],
            ['$3,000 (× 0.14 = $420)', '$419.99'],
          ].map(([calc, ans], i) => (
            <div key={i} className="flex justify-between py-1">
              <div className="text-xs font-mono" style={{ color: DARK }}>{calc}</div>
              <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>= {ans}</div>
            </div>
          ))}
        </div>
      </Section>
      
      <Section title="4 · PAYMENTS">
        <div className="rounded-lg p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>12 MO 0%</div>
          <div className="text-xs font-mono" style={{ color: DARK }}>Monthly = Total ÷ 12</div>
        </div>
        <div className="rounded-lg p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>60 MO 0% (20% down)</div>
          <div className="text-xs font-mono" style={{ color: DARK }}>Down = Total × 0.20</div>
          <div className="text-xs font-mono" style={{ color: DARK }}>Monthly = (Total − Down) ÷ 60</div>
        </div>
      </Section>
      
      <Section title="REVERSE MATH (OUT-THE-DOOR → SUBTOTAL)">
        <div className="rounded-lg p-3" style={{ background: LIGHT_BG }}>
          <div className="text-xs font-mono mb-2" style={{ color: DARK }}>Subtotal = (OTD − Delivery − SafeLock) ÷ 1.0825</div>
          <div className="text-[11px]" style={{ color: MID }}>Guest says "$3,000 out the door" — strip delivery and SafeLock first, then divide by 1.0825 to find the merchandise number that fits.</div>
        </div>
      </Section>
      
      <Section title="FULL TICKET WORKED EXAMPLE">
        <div className="rounded-lg p-3" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>Sofa $899 + Loveseat $699 + Chair $599 (no discount)</div>
          <div className="space-y-1 text-xs font-mono" style={{ color: DARK }}>
            <div className="flex justify-between"><span>Subtotal:</span><span>$2,197</span></div>
            <div className="flex justify-between"><span>SafeLock (14%, rounded):</span><span style={{ color: ORANGE_DARK }}>$309.99</span></div>
            <div className="flex justify-between"><span>Tax (8.25% × $2,197):</span><span>$181.25</span></div>
            <div className="flex justify-between"><span>Delivery:</span><span>$149.99</span></div>
            <div className="flex justify-between font-bold pt-1" style={{ borderTop: `1px solid ${BORDER}`, color: ORANGE_DARK }}><span>OTD Total:</span><span>$2,838.23</span></div>
            <div className="pt-1 text-[11px]" style={{ color: MID }}>12 MO: $236.52/mo · 60 MO @ 20% down: $37.84/mo</div>
          </div>
        </div>
      </Section>
      
      <RememberCard text="The math is the same every ticket. Get fast at it and the guest never sees you sweat the numbers." />
    </>
  );
}
// ============ PROFILE PICKER ============
function ProfilePicker({ profiles, onSelect, onCreate, onDelete, trainerEmail, setTrainerEmail }) {
  const [showSettings, setShowSettings] = useState(false);
  const [emailDraft, setEmailDraft] = useState(trainerEmail || '');
  const [confirmDelete, setConfirmDelete] = useState(null);
  
  return (
    <div className="overflow-y-auto" style={{ height: '750px', background: IOS_BG }}>
      <div className="px-6 pt-8 pb-6" style={{ background: `linear-gradient(160deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-white/80">THE LAUNCH</div>
            <div className="text-2xl font-bold text-white leading-tight mt-1">Who&rsquo;s using this?</div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="text-white/80 active:scale-95">
            <Settings size={18} />
          </button>
        </div>
        <div className="text-xs text-white/85 mt-2">Tap your profile to continue. New here? Create one.</div>
      </div>
      
      {showSettings && (
        <div className="mx-4 mt-4 rounded-2xl p-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: IOS_LABEL_2 }}>TRAINER EMAIL</div>
          <div className="text-[11px] mb-2" style={{ color: MID }}>Where pre-training assessment results get sent.</div>
          <input
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="trainer@example.com"
            className="w-full p-2 text-xs border rounded-lg"
            style={{ borderColor: BORDER }}
          />
          <button onClick={() => setTrainerEmail(emailDraft)} className="mt-2 w-full py-2 rounded-lg text-xs font-bold text-white" style={{ background: ORANGE }}>
            Save
          </button>
        </div>
      )}
      
      <div className="px-4 pt-5">
        {profiles.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: ORANGE_TINT }}>
              <User size={20} style={{ color: ORANGE_DARK }} />
            </div>
            <div className="text-sm font-bold mb-1" style={{ color: DARK }}>Welcome to The Launch</div>
            <div className="text-xs mb-4" style={{ color: MID }}>No profiles yet on this device. Create yours to get started.</div>
            <button onClick={onCreate} className="w-full py-3 rounded-xl text-sm font-bold text-white active:scale-[0.98]" style={{ background: ORANGE }}>
              Create My Profile
            </button>
          </div>
        ) : (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 px-1" style={{ color: IOS_LABEL_2 }}>Your Profile</div>
            <div className="rounded-2xl overflow-hidden mb-4" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
              {profiles.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0)).map((p, i, arr) => {
                const last = i === arr.length - 1;
                if (confirmDelete === p.id) {
                  return (
                    <div key={p.id} className="px-4 py-3" style={{ borderBottom: last ? 'none' : `0.5px solid ${IOS_HAIRLINE}` }}>
                      <div className="text-xs font-bold mb-1" style={{ color: RED }}>Delete &ldquo;{p.name}&rdquo;?</div>
                      <div className="text-[10px] mb-2" style={{ color: IOS_LABEL_2 }}>This permanently removes their progress, scores, signatures, and pay log. Cannot be undone.</div>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-lg text-xs font-bold" style={{ background: IOS_BG, color: DARK }}>Cancel</button>
                        <button onClick={() => { onDelete(p.id); setConfirmDelete(null); }} className="flex-1 py-2 rounded-lg text-xs font-bold text-white" style={{ background: RED }}>Delete</button>
                      </div>
                    </div>
                  );
                }
                return (
                  <button key={p.id} onClick={() => onSelect(p.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50" style={{ borderBottom: last ? 'none' : `0.5px solid ${IOS_HAIRLINE}` }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: ORANGE_TINT }}>
                      <div className="text-sm font-bold" style={{ color: ORANGE_DARK }}>{(p.name || '?').charAt(0).toUpperCase()}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-sm font-bold" style={{ color: DARK }}>{p.name || 'Unnamed'}</div>
                        {p.hasPin && <Lock size={10} style={{ color: IOS_LABEL_2 }} />}
                      </div>
                      <div className="text-[10px]" style={{ color: IOS_LABEL_2 }}>
                        {p.lastActive ? `Last opened ${fmtDateAgo(p.lastActive)}` : 'New profile'}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: IOS_BG }}>
                      <X size={12} style={{ color: IOS_LABEL_2 }} />
                    </button>
                  </button>
                );
              })}
            </div>
            <button onClick={onCreate} className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: '#fff', color: ORANGE_DARK, boxShadow: CARD_SHADOW }}>
              <span className="text-base">+</span> New Trainee
            </button>
          </>
        )}
      </div>
      
      <div className="px-6 pt-6 text-center">
        <div className="text-[10px]" style={{ color: IOS_LABEL_2 }}>Your data stays on your profile.</div>
        <div className="text-[10px]" style={{ color: IOS_LABEL_2 }}>Other trainees on this device can&rsquo;t see it.</div>
      </div>
    </div>
  );
}

function fmtDateAgo(ts) {
  if (!ts) return 'never';
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ============ PROFILE SHEET (sign out / switch user) ============
function ProfileSheet({ traineeName, pin, onClose, onSwitchUser, onSignOut }) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full"
        style={{
          background: '#F2F2F7',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          paddingBottom: '24px',
          animation: 'slideUp 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-3">
          <div style={{ width: '36px', height: '4px', background: BORDER, borderRadius: '2px' }} />
        </div>
        
        <div className="px-4 pb-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: ORANGE_TINT }}>
            <div className="text-base font-bold" style={{ color: ORANGE_DARK }}>{(traineeName || '?').charAt(0).toUpperCase()}</div>
          </div>
          <div className="flex-1">
            <div className="text-base font-bold" style={{ color: DARK }}>{traineeName || 'You'}</div>
            <div className="text-[11px]" style={{ color: MID }}>Signed in {pin ? '· PIN protected' : '· No PIN'}</div>
          </div>
        </div>
        
        <div className="mx-4 rounded-2xl overflow-hidden" style={{ background: '#fff' }}>
          <button onClick={onSwitchUser} className="w-full px-4 py-3.5 flex items-center justify-between text-left active:bg-gray-50" style={{ borderBottom: `0.5px solid ${IOS_HAIRLINE}` }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: DARK }}>Switch User</div>
              <div className="text-[10px]" style={{ color: MID }}>Pick a different profile on this device</div>
            </div>
            <Users size={18} style={{ color: MID }} />
          </button>
          <button onClick={onSignOut} className="w-full px-4 py-3.5 flex items-center justify-between text-left active:bg-gray-50">
            <div>
              <div className="text-sm font-semibold" style={{ color: RED }}>{pin ? 'Sign Out & Lock' : 'Sign Out'}</div>
              <div className="text-[10px]" style={{ color: MID }}>{pin ? 'PIN required to come back' : 'Returns to profile picker'}</div>
            </div>
            <Lock size={18} style={{ color: RED }} />
          </button>
        </div>
        
        {!pin && (
          <div className="mx-4 mt-3 rounded-2xl p-3" style={{ background: '#FFF6E8', border: `1px solid ${ORANGE}` }}>
            <div className="text-[11px] font-bold mb-1" style={{ color: ORANGE_DARK }}>No PIN set</div>
            <div className="text-[10px]" style={{ color: DARK }}>Anyone on this device can open your profile. Set a PIN in the Me tab to keep your data private.</div>
          </div>
        )}
        
        <button onClick={onClose} className="mx-4 mt-3 w-[calc(100%-2rem)] py-3 rounded-2xl text-sm font-bold" style={{ background: '#fff', color: DARK }}>
          Cancel
        </button>
      </div>
    </div>
  );
}


function PinEntry({ profile, attempt, setAttempt, error, onSubmit, onBack }) {
  if (!profile) return null;
  
  const append = (n) => {
    if (attempt.length < 4) {
      const next = attempt + n;
      setAttempt(next);
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 100);
      }
    }
  };
  const back = () => setAttempt(attempt.slice(0, -1));
  
  return (
    <div className="overflow-y-auto" style={{ height: '750px', background: IOS_BG }}>
      <div className="px-6 pt-8 pb-6" style={{ background: `linear-gradient(160deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)` }}>
        <div className="text-[10px] font-bold tracking-widest text-white/80">SIGNED IN AS</div>
        <div className="text-2xl font-bold text-white leading-tight mt-1">{profile.name}</div>
        <div className="text-xs text-white/85 mt-2">Enter your 4-digit PIN to continue.</div>
      </div>
      
      <div className="px-6 pt-8 flex flex-col items-center">
        <div className="flex gap-3 mb-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="w-4 h-4 rounded-full" style={{ background: i < attempt.length ? ORANGE : (error ? RED : BORDER) }} />
          ))}
        </div>
        {error && <div className="text-xs font-bold mb-3" style={{ color: RED }}>Wrong PIN. Try again.</div>}
        
        <div className="grid grid-cols-3 gap-3 w-64">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => append(n.toString())} className="aspect-square rounded-full text-2xl font-light active:scale-95 transition-transform" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>
              {n}
            </button>
          ))}
          <div></div>
          <button onClick={() => append('0')} className="aspect-square rounded-full text-2xl font-light active:scale-95" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>
            0
          </button>
          <button onClick={back} className="aspect-square rounded-full flex items-center justify-center active:scale-95" style={{ color: DARK }}>
            <ArrowLeft size={18} />
          </button>
        </div>
        
        <button onClick={onBack} className="mt-6 text-xs font-bold" style={{ color: ORANGE_DARK }}>← Switch user</button>
      </div>
    </div>
  );
}

// ============ WELCOME FLOW ============
function WelcomeFlow({ traineeName, setTraineeName, assessment, setAssessment, signatures, setSignatures, hrForms, setHrForms, emergencyContact, setEmergencyContact, pin, setPin, trainerEmail, welcomeProgress, setWelcomeProgress, onComplete }) {
  // Steps:
  // 0: welcome | 1: name | 2: non-negotiables read | 3: NN sign | 4: hygiene read | 5: hygiene sign
  // 6: pay overview | 7: pay sign | 8: HR forms | 9: emergency contact | 10: PIN setup
  // 11: assessment intro | 12: ratings | 13: fill-ins | 14: hope | 15: send to trainer
  const wp = welcomeProgress || { step: 0, tempName: '', ratings: {}, fillIns: {}, hope: '', ratingPage: 0, fillPage: 0 };
  const step = wp.step;
  const tempName = wp.tempName || traineeName || '';
  const ratings = wp.ratings || {};
  const fillIns = wp.fillIns || {};
  const hope = wp.hope || '';
  const ratingPage = wp.ratingPage || 0;
  const fillPage = wp.fillPage || 0;
  
  const setStep = (n) => setWelcomeProgress({ ...wp, step: n });
  const setTempName = (n) => setWelcomeProgress({ ...wp, tempName: n });
  const setRatings = (r) => setWelcomeProgress({ ...wp, ratings: r });
  const setFillIns = (f) => setWelcomeProgress({ ...wp, fillIns: f });
  const setHope = (h) => setWelcomeProgress({ ...wp, hope: h });
  const setRatingPage = (n) => setWelcomeProgress({ ...wp, ratingPage: n });
  const setFillPage = (n) => setWelcomeProgress({ ...wp, fillPage: n });
  
  const RATING_QS = [
    { id: 1, t: 'How well do you feel you provide excellent customer service?' },
    { id: 2, t: 'How good are you at building rapport when meeting someone new?' },
    { id: 3, t: 'How well do you know furniture product knowledge?' },
    { id: 4, t: 'How well do you know mattress product knowledge?' },
    { id: 5, t: 'How would you rate your current general sales skills?' },
    { id: 6, t: 'How good are you at listening?' },
    { id: 7, t: 'How well would you rate your skills on a computer?' },
    { id: 8, t: 'How well would you rate your skills on an iPad or tablet?' },
    { id: 9, t: 'How would you rate your organizational skills?' },
    { id: 10, t: 'How well do you handle rejection?' },
    { id: 11, t: 'How well can you demonstrate product features and benefits?' },
    { id: 12, t: 'How open are you to coaching and performance reviews?' },
    { id: 13, t: 'How well do you follow through on a project?' },
    { id: 14, t: 'How would you rate your ability to be on time?' },
  ];
  const FILL_QS = [
    { id: 15, t: 'Who do you think is the current largest manufacturer of furniture in the world?' },
    { id: 16, t: 'Who do you think is the current largest retailer of furniture in the United States?' },
    { id: 17, t: 'What do you think is the #1 recommended mattress brand in America?' },
    { id: 18, t: 'What do you think is the most important part of any sales process?' },
    { id: 19, t: 'What do you think is the average price of a queen mattress set sold?' },
    { id: 20, t: 'Can you list all of the different sizes mattresses come in?' },
    { id: 21, t: 'What do you think is the most important part of selling mattresses?' },
  ];
  
  const finishAndSend = async (sendEmail) => {
    const fullAssessment = { ratings, fillIns, hope, completedAt: new Date().toISOString() };
    if (sendEmail) {
      const body = buildAssessmentEmail(tempName, fullAssessment, signatures, hrForms, emergencyContact);
      const subject = encodeURIComponent(`Pre-Training Assessment — ${tempName}`);
      // Open mail in a new tab/window so it doesn't navigate the artifact
      window.open(`mailto:${trainerEmail}?subject=${subject}&body=${encodeURIComponent(body)}`, '_blank');
    }
    // Pass the assessment directly to onComplete so the parent can save it atomically
    await onComplete(fullAssessment);
  };
  
  // ===== Step renderers =====
  
  if (step === 0) {
    return (
      <FlowContainer>
        <FlowHero subtitle="THE LAUNCH" title="Welcome to the team." sub="You've joined a family-owned business that's been here over 100 years. Around here, people come first — guests and teammates both." />
        <div className="px-6 pt-6 flex-1">
          <FlowCard title="WHAT THIS APP IS" body="The Launch is your training and your tool. Six days of structured training, then a permanent reference for everything you need on the floor." />
          <FlowCard title="WHAT WE EXPECT" body="Show up on time. Be coachable. Treat every guest the way you'd want your mom or best friend treated." />
          <FlowCard title="WHAT YOU CAN EXPECT FROM US" body="Real training. Real money. Real support. The structure to grow into a Million Dollar Writer if you want it." />
          <div className="rounded-2xl p-4 mb-3" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
            <div className="text-xs font-bold mb-2" style={{ color: ORANGE_DARK }}>BEFORE YOU START</div>
            <div className="text-sm leading-relaxed" style={{ color: DARK }}>We need to capture your name, get your acknowledgment of the policies you'll work under, and get a 5-minute self-assessment. Takes about 10–15 minutes total.</div>
          </div>
        </div>
        <FlowFooter onNext={() => setStep(1)} nextLabel="Let's get started →" />
      </FlowContainer>
    );
  }
  
  if (step === 1) {
    return (
      <FlowContainer>
        <FlowHeader title="What should we call you?" sub={`Step 1 of 7`} />
        <div className="px-6 pt-6 flex-1">
          <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>YOUR FULL NAME</div>
            <input
              type="text"
              autoFocus
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="e.g. Maria Garcia"
              className="w-full text-2xl font-bold focus:outline-none border-b pb-2"
              style={{ color: DARK, borderColor: BORDER }}
            />
            <div className="text-[10px] mt-3" style={{ color: MID }}>This appears on your progress page, your pay tab, and on your signed acknowledgments.</div>
          </div>
        </div>
        <FlowFooter
          onBack={() => setStep(0)}
          onNext={() => { if (tempName.trim()) { setTraineeName(tempName.trim()); setStep(2); } }}
          nextDisabled={!tempName.trim()}
        />
      </FlowContainer>
    );
  }
  
  if (step === 2) {
    return (
      <FlowContainer>
        <FlowHeader title="The Non-Negotiables" sub={`Step 2 of 7 · ${tempName.split(' ')[0] || 'You'}`} smallSub="Mandatory expectations — not optional." />
        <div className="px-6 pt-5 flex-1">
          <div className="rounded-2xl p-3 mb-3" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
            <div className="text-xs italic" style={{ color: DARK }}>Without commitment, we have nothing. Success requires everyone to fully commit to following directions and executing every task necessary to achieve our goals.</div>
          </div>
          <NonNegotiableCard num="1" title="Punctuality & Attendance" body="On time, clocked in, ready to serve at start of shift." />
          <NonNegotiableCard num="2" title="Turnovers" body="Effective TOs close sales. 6-step framework. Manager intro by name, goal, situation (Remodel/Replace/Relocate), progress, concerns, transition." />
          <NonNegotiableCard num="3" title="Rest Tests" body="7 per week — NO EXCEPTIONS. Cannot be made up later." />
          <NonNegotiableCard num="4" title="Undelivered Report" body="Review weekly. Personally update each guest. Document every interaction." />
          <NonNegotiableCard num="5" title="Cleanliness & Presentation" body="Section showroom-ready at all times. Floors clean, tags correct, displays neat." />
          <NonNegotiableCard num="6" title="Follow-Up" body="Full contact info on every guest. At least 5 follow-ups for walk-outs. Track every one." />
          <NonNegotiableCard num="7" title="Appearance" body="Business casual. Refer to Workplace Hygiene & Dress Code Policy." last />
        </div>
        <FlowFooter onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="I&rsquo;ve read these →" />
      </FlowContainer>
    );
  }
  
  if (step === 3) {
    return (
      <SignatureStep
        title="Sign: Non-Negotiables"
        sub={`Step 2 of 7 · ${tempName.split(' ')[0] || 'You'}`}
        statement="I have read and understand the seven non-negotiables. I commit to upholding them every shift."
        nameDefault={tempName}
        onSign={(fullName, date) => {
          setSignatures({ ...signatures, nonNegotiables: { fullName, date } });
          setStep(4);
        }}
        onBack={() => setStep(2)}
        existing={signatures.nonNegotiables}
      />
    );
  }
  
  if (step === 4) {
    return (
      <FlowContainer>
        <FlowHeader title="Hygiene & Dress Code" sub={`Step 3 of 7 · ${tempName.split(' ')[0] || 'You'}`} smallSub="How we show up to work." />
        <div className="px-6 pt-5 flex-1">
          <PolicyBlock title="Personal Hygiene" items={[
            'Bathe daily. Clean, wrinkle-free attire every shift.',
            'Brush teeth. Maintain fresh breath. Daily deodorant or antiperspirant.',
            'Avoid heavy perfumes/colognes — guest allergies.',
            'Trim nails. No nail-biting at work.',
            'Wash hands often.',
          ]} />
          <PolicyBlock title="Grooming" items={[
            'Hair and facial hair: neat, well-groomed, natural color.',
            'Subtle, professional makeup.',
            'Cover tattoos when possible.',
            'Minimal, non-distracting jewelry.',
          ]} />
          <PolicyBlock title="Dress Code" items={[
            'Men: Ashley button-up shirts, slacks, dress shoes. Tucked in.',
            'Women: Ashley dress tops or button-ups, slacks, closed-toe dress shoes.',
            'Polos: Ashley polos on weekends only, with name tag and dress shoes.',
            'No tennis shoes, Crocs, Vans, Converse, or similar casual footwear.',
          ]} />
          <div className="rounded-2xl p-3 mt-2" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
            <div className="text-xs" style={{ color: DARK }}><span className="font-bold">Failure to follow:</span> sent home to change. Repeat infractions go through standard performance management.</div>
          </div>
        </div>
        <FlowFooter onBack={() => setStep(3)} onNext={() => setStep(5)} nextLabel="I&rsquo;ve read this →" />
      </FlowContainer>
    );
  }
  
  if (step === 5) {
    return (
      <SignatureStep
        title="Sign: Hygiene & Dress Code"
        sub={`Step 3 of 7 · ${tempName.split(' ')[0] || 'You'}`}
        statement="I have read and understand the Workplace Hygiene & Dress Code Policy."
        nameDefault={tempName}
        onSign={(fullName, date) => {
          setSignatures({ ...signatures, hygiene: { fullName, date } });
          setStep(6);
        }}
        onBack={() => setStep(4)}
        existing={signatures.hygiene}
      />
    );
  }
  
  if (step === 6) {
    return (
      <FlowContainer>
        <FlowHeader title="Pay & Bonus Structure" sub={`Step 4 of 7 · ${tempName.split(' ')[0] || 'You'}`} smallSub="How you get paid here." />
        <div className="px-6 pt-5 flex-1">
          <FlowCard title="COMMISSION" body="5% on furniture and mattresses. 20% on SafeLock and protection plans. Paid every pay period on what you wrote." />
          <FlowCard title="QUARTERLY BONUSES" body="Volume ($1K–$2.5K), Bedding ($500–$2K), SafeLock ($500–$1.25K), Delivery ($100–$500). Stack all four = $6,250 per quarter." />
          <FlowCard title="QUALIFICATION KPIs" body="53% margin · 520 hours · 91 Rest Tests · TY notes · Bi-weekly coaching logs · Continued education · Undelivered list worked. Miss any and you don't qualify for bonus that quarter." />
          <FlowCard title="MILLION DOLLAR WRITER" body="Hit $1M for the year — next year's commission rate climbs +0.5% / +2.5%. Each consecutive growth year, it climbs more." />
          <div className="rounded-2xl p-3" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
            <div className="text-xs" style={{ color: DARK }}><span className="font-bold">Real numbers:</span> Top tiers + qualified KPIs = $25K+ per year on top of commission. Hit Million Dollar Writer pace and earn a permanent raise.</div>
          </div>
        </div>
        <FlowFooter onBack={() => setStep(5)} onNext={() => setStep(7)} nextLabel="I understand →" />
      </FlowContainer>
    );
  }
  
  if (step === 7) {
    return (
      <SignatureStep
        title="Acknowledge: Pay Plan"
        sub={`Step 4 of 7 · ${tempName.split(' ')[0] || 'You'}`}
        statement="I understand the commission structure, bonus tiers, and KPI gates required to qualify for bonus."
        nameDefault={tempName}
        onSign={(fullName, date) => {
          setSignatures({ ...signatures, payBonus: { fullName, date } });
          setStep(8);
        }}
        onBack={() => setStep(6)}
        existing={signatures.payBonus}
      />
    );
  }
  
  if (step === 8) {
    const update = (key) => setHrForms({ ...hrForms, [key]: !hrForms[key] });
    return (
      <FlowContainer>
        <FlowHeader title="HR Forms" sub={`Step 5 of 7 · ${tempName.split(' ')[0] || 'You'}`} smallSub="Confirm your onboarding paperwork status." />
        <div className="px-6 pt-5 flex-1">
          <div className="text-xs mb-3" style={{ color: MID }}>These are forms you complete with HR — separate from this app. Mark what you&rsquo;ve done. Your trainer will follow up on anything you haven&rsquo;t.</div>
          <CheckRow label="I-9 (Employment Eligibility)" checked={!!hrForms.i9} onToggle={() => update('i9')} />
          <CheckRow label="W-4 (Tax Withholding)" checked={!!hrForms.w4} onToggle={() => update('w4')} />
          <CheckRow label="Direct Deposit" checked={!!hrForms.dd} onToggle={() => update('dd')} />
          <CheckRow label="Background Check" checked={!!hrForms.bg} onToggle={() => update('bg')} last />
        </div>
        <FlowFooter onBack={() => setStep(7)} onNext={() => setStep(9)} />
      </FlowContainer>
    );
  }
  
  if (step === 9) {
    const update = (key, val) => setEmergencyContact({ ...emergencyContact, [key]: val });
    return (
      <FlowContainer>
        <FlowHeader title="Emergency Contact" sub={`Step 6 of 7 · ${tempName.split(' ')[0] || 'You'}`} smallSub="Who do we call if something happens at work?" />
        <div className="px-6 pt-5 flex-1">
          <div className="rounded-2xl p-3 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: MID }}>NAME</div>
            <input value={emergencyContact.name || ''} onChange={(e) => update('name', e.target.value)} placeholder="Full name" className="w-full text-base font-semibold focus:outline-none" style={{ color: DARK }} />
          </div>
          <div className="rounded-2xl p-3 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: MID }}>RELATIONSHIP</div>
            <input value={emergencyContact.relationship || ''} onChange={(e) => update('relationship', e.target.value)} placeholder="e.g. Spouse, Parent, Sibling" className="w-full text-base font-semibold focus:outline-none" style={{ color: DARK }} />
          </div>
          <div className="rounded-2xl p-3 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: MID }}>PHONE</div>
            <input type="tel" value={emergencyContact.phone || ''} onChange={(e) => update('phone', e.target.value)} placeholder="(555) 555-5555" className="w-full text-base font-semibold focus:outline-none" style={{ color: DARK }} />
          </div>
          <div className="text-[11px]" style={{ color: MID }}>You can leave this blank if you prefer — but we strongly recommend filling it in.</div>
        </div>
        <FlowFooter onBack={() => setStep(8)} onNext={() => setStep(10)} nextLabel={emergencyContact.name ? 'Continue →' : 'Skip for now →'} />
      </FlowContainer>
    );
  }
  
  if (step === 10) {
    return (
      <PinSetupStep
        sub={`Step 7 of 7 · ${tempName.split(' ')[0] || 'You'}`}
        existing={pin}
        onSet={(p) => { setPin(p); setStep(11); }}
        onSkip={() => { setPin(''); setStep(11); }}
        onBack={() => setStep(9)}
      />
    );
  }
  
  if (step === 11) {
    return (
      <FlowContainer>
        <FlowHero subtitle={`PRE-TRAINING ASSESSMENT · ${tempName.split(' ')[0] || 'You'}`} title="Almost there." sub="One quick honest self-assessment so your trainer knows where to coach you." />
        <div className="px-6 pt-6 flex-1">
          <div className="rounded-2xl p-5" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-sm leading-relaxed" style={{ color: DARK }}>14 self-ratings (1–10), 7 short fill-ins about furniture, and one final question. About 5 minutes.</div>
            <div className="text-sm leading-relaxed mt-3 font-bold" style={{ color: ORANGE_DARK }}>Be honest. &ldquo;I don&rsquo;t know&rdquo; is the right answer when it&rsquo;s true.</div>
            <div className="text-sm leading-relaxed mt-3" style={{ color: DARK }}>When you&rsquo;re done, you can send the results straight to your trainer.</div>
          </div>
        </div>
        <FlowFooter onBack={() => setStep(10)} onNext={() => setStep(12)} nextLabel="Start Assessment →" />
      </FlowContainer>
    );
  }
  
  if (step === 12) {
    // Ratings batched: 3 screens of 5/5/4 questions
    const batches = [RATING_QS.slice(0, 5), RATING_QS.slice(5, 10), RATING_QS.slice(10, 14)];
    const batch = batches[ratingPage] || [];
    const allAnswered = batch.every(q => ratings[q.id] != null);
    return (
      <RatingBatch
        questions={batch}
        ratings={ratings}
        onChange={(id, v) => setRatings({ ...ratings, [id]: v })}
        progress={`Self-Ratings · ${ratingPage + 1} of 3`}
        progressPct={((ratingPage + 1) / 5) * 100}
        onPrev={() => ratingPage > 0 ? setRatingPage(ratingPage - 1) : setStep(11)}
        onNext={() => {
          if (ratingPage < batches.length - 1) setRatingPage(ratingPage + 1);
          else setStep(13);
        }}
        canNext={allAnswered}
      />
    );
  }
  
  if (step === 13) {
    // All 7 fill-ins on one screen
    return (
      <FillBatch
        questions={FILL_QS}
        answers={fillIns}
        onChange={(id, v) => setFillIns({ ...fillIns, [id]: v })}
        progress="Knowledge Check · 4 of 5"
        progressPct={80}
        onPrev={() => setStep(12)}
        onNext={() => setStep(14)}
      />
    );
  }
  
  if (step === 14) {
    return (
      <FillPage
        q={{ id: 22, t: 'What is the one thing you most hope to get out of your training?' }}
        value={hope}
        onChange={setHope}
        progress="Final · 5 of 5"
        progressPct={100}
        onPrev={() => setStep(13)}
        onNext={() => setStep(15)}
        finalLabel="Almost done →"
        big
      />
    );
  }
  
  if (step === 15) {
    return (
      <FlowContainer>
        <FlowHero subtitle="ASSESSMENT COMPLETE" title="Send to your trainer?" sub="One tap opens your email with your responses pre-filled. Your trainer reads this before Day 1." />
        <div className="px-6 pt-6 flex-1">
          <div className="rounded-2xl p-4 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: MID }}>WILL BE SENT TO</div>
            <div className="text-sm font-bold" style={{ color: DARK }}>{trainerEmail}</div>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>WHAT GETS SENT</div>
            <div className="text-xs space-y-1" style={{ color: DARK }}>
              <div>• Your name and start date</div>
              <div>• All 14 ratings + your average</div>
              <div>• All 7 fill-in answers</div>
              <div>• What you hope to get from training</div>
              <div>• Signed acknowledgments (Non-Negotiables, Hygiene, Pay)</div>
              <div>• HR forms status</div>
            </div>
          </div>
          <div className="text-[11px] mt-3 text-center" style={{ color: MID }}>Tapping &ldquo;Send&rdquo; opens your email app with everything pre-filled. Just tap send there.</div>
        </div>
        <div className="px-6 pb-6 pt-2 flex gap-2">
          <button onClick={() => finishAndSend(false)} className="px-5 py-4 rounded-2xl text-sm font-bold" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>Skip & Finish</button>
          <button onClick={() => finishAndSend(true)} className="flex-1 py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98]" style={{ background: ORANGE, boxShadow: '0 4px 14px rgba(243,117,32,0.35)' }}>
            Send & Start Training →
          </button>
        </div>
      </FlowContainer>
    );
  }
  
  return null;
}

// ============ FLOW PRIMITIVES ============
function FlowContainer({ children }) {
  return <div className="overflow-y-auto flex flex-col" style={{ height: '750px', background: IOS_BG }}>{children}</div>;
}
function FlowHero({ subtitle, title, sub }) {
  return (
    <div className="px-6 pt-8 pb-10" style={{ background: `linear-gradient(160deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)` }}>
      <div className="text-[10px] font-bold tracking-widest text-white/80 mb-1">{subtitle}</div>
      <div className="text-3xl font-bold text-white leading-tight">{title}</div>
      {sub && <div className="text-sm text-white/90 mt-3 leading-relaxed">{sub}</div>}
    </div>
  );
}
function FlowHeader({ title, sub, smallSub }) {
  return (
    <div className="px-6 pt-8 pb-6" style={{ background: `linear-gradient(160deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)` }}>
      <div className="text-[10px] font-bold tracking-widest text-white/80 mb-1">{sub}</div>
      <div className="text-2xl font-bold text-white leading-tight">{title}</div>
      {smallSub && <div className="text-sm text-white/90 mt-2">{smallSub}</div>}
    </div>
  );
}
function FlowCard({ title, body }) {
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
      <div className="text-xs font-bold mb-2" style={{ color: ORANGE_DARK }}>{title}</div>
      <div className="text-sm leading-relaxed" style={{ color: DARK }}>{body}</div>
    </div>
  );
}
function FlowFooter({ onBack, onNext, nextLabel, nextDisabled }) {
  return (
    <div className="px-6 pb-6 pt-2 flex gap-2">
      {onBack && <button onClick={onBack} className="px-5 py-4 rounded-2xl text-sm font-bold" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>Back</button>}
      <button onClick={onNext} disabled={nextDisabled} className="flex-1 py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98] disabled:opacity-40" style={{ background: ORANGE, boxShadow: '0 4px 14px rgba(243,117,32,0.35)' }}>
        {nextLabel || 'Continue →'}
      </button>
    </div>
  );
}

function NonNegotiableCard({ num, title, body, last }) {
  return (
    <div className="rounded-2xl p-3 flex gap-3" style={{ background: '#fff', boxShadow: CARD_SHADOW, marginBottom: last ? 0 : '8px' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: ORANGE }}>
        <div className="text-sm font-bold text-white">{num}</div>
      </div>
      <div className="flex-1">
        <div className="text-sm font-bold" style={{ color: DARK }}>{title}</div>
        <div className="text-[11px] leading-relaxed mt-0.5" style={{ color: MID }}>{body}</div>
      </div>
    </div>
  );
}

function PolicyBlock({ title, items }) {
  return (
    <div className="rounded-2xl p-3 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
      <div className="text-xs font-bold mb-2" style={{ color: ORANGE_DARK }}>{title}</div>
      {items.map((t, i) => (
        <div key={i} className="text-[11px] mb-1 pl-3 relative" style={{ color: DARK }}>
          <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
        </div>
      ))}
    </div>
  );
}

function CheckRow({ label, checked, onToggle, last }) {
  return (
    <button onClick={onToggle} className="w-full rounded-2xl p-3 mb-2 flex items-center gap-3" style={{ background: '#fff', boxShadow: CARD_SHADOW, marginBottom: last ? 0 : '8px' }}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: checked ? ORANGE : '#fff', border: `2px solid ${checked ? ORANGE : BORDER}` }}>
        {checked && <Check size={14} className="text-white" strokeWidth={3} />}
      </div>
      <div className="text-sm font-semibold flex-1 text-left" style={{ color: DARK }}>{label}</div>
    </button>
  );
}

function SignatureStep({ title, sub, statement, nameDefault, onSign, onBack, existing }) {
  const [fullName, setFullName] = useState(existing?.fullName || nameDefault || '');
  const today = new Date().toLocaleDateString();
  
  return (
    <FlowContainer>
      <FlowHeader title={title} sub={sub} />
      <div className="px-6 pt-5 flex-1">
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
          <div className="text-xs leading-relaxed" style={{ color: DARK }}>{statement}</div>
        </div>
        
        <div className="rounded-2xl p-4 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
          <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>YOUR FULL NAME (TYPED SIGNATURE)</div>
          <input
            type="text"
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Type your full legal name"
            className="w-full text-xl font-bold focus:outline-none border-b pb-2"
            style={{ color: DARK, borderColor: BORDER, fontStyle: 'italic' }}
          />
          <div className="text-[10px] mt-3" style={{ color: MID }}>Date: {today}</div>
        </div>
        
        <div className="text-[11px]" style={{ color: MID }}>By typing your name and tapping Sign, you acknowledge you have read and understand the policy above. Your signature is recorded with today&rsquo;s date and stays in your profile for the trainer to review.</div>
      </div>
      <FlowFooter
        onBack={onBack}
        onNext={() => { if (fullName.trim().length >= 3) onSign(fullName.trim(), today); }}
        nextLabel="Sign &amp; Continue →"
        nextDisabled={fullName.trim().length < 3}
      />
    </FlowContainer>
  );
}

function PinSetupStep({ sub, existing, onSet, onSkip, onBack }) {
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [phase, setPhase] = useState(existing ? 'has' : 'enter'); // has | enter | confirm
  const [error, setError] = useState(false);
  
  const target = phase === 'enter' ? pin1 : pin2;
  const setter = phase === 'enter' ? setPin1 : setPin2;
  
  const append = (n) => {
    if (target.length < 4) {
      const next = target + n;
      setter(next);
      if (next.length === 4) {
        if (phase === 'enter') {
          setTimeout(() => { setPhase('confirm'); setError(false); }, 100);
        } else {
          setTimeout(() => {
            if (next === pin1) onSet(next);
            else { setError(true); setPin2(''); }
          }, 100);
        }
      }
    }
  };
  const back = () => setter(target.slice(0, -1));
  
  if (phase === 'has') {
    return (
      <FlowContainer>
        <FlowHeader title="PIN Already Set" sub={sub} />
        <div className="px-6 pt-6 flex-1 text-center">
          <div className="rounded-2xl p-5 mt-4" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-sm font-semibold mb-1" style={{ color: DARK }}>Your PIN is set.</div>
            <div className="text-xs" style={{ color: MID }}>You&rsquo;ll be asked for it next time you open the app.</div>
          </div>
        </div>
        <FlowFooter onBack={onBack} onNext={onSkip} nextLabel="Continue →" />
      </FlowContainer>
    );
  }
  
  return (
    <FlowContainer>
      <FlowHeader
        title={phase === 'enter' ? 'Set a 4-digit PIN' : 'Confirm your PIN'}
        sub={sub}
        smallSub={phase === 'enter' ? 'Optional. Recommended on shared devices — keeps your data private.' : 'Type the same 4 digits again.'}
      />
      <div className="px-6 pt-6 flex flex-col items-center flex-1">
        <div className="flex gap-3 mb-4 mt-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="w-4 h-4 rounded-full" style={{ background: i < target.length ? ORANGE : (error ? RED : BORDER) }} />
          ))}
        </div>
        {error && <div className="text-xs font-bold mb-3" style={{ color: RED }}>PINs don&rsquo;t match. Try again.</div>}
        
        <div className="grid grid-cols-3 gap-3 w-64">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => append(n.toString())} className="aspect-square rounded-full text-2xl font-light active:scale-95" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>{n}</button>
          ))}
          <div></div>
          <button onClick={() => append('0')} className="aspect-square rounded-full text-2xl font-light active:scale-95" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>0</button>
          <button onClick={back} className="aspect-square rounded-full flex items-center justify-center active:scale-95" style={{ color: DARK }}>
            <ArrowLeft size={18} />
          </button>
        </div>
      </div>
      <div className="px-6 pb-6 pt-2 flex gap-2">
        <button onClick={onBack} className="px-5 py-4 rounded-2xl text-sm font-bold" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>Back</button>
        <button onClick={onSkip} className="flex-1 py-4 rounded-2xl text-base font-bold" style={{ background: '#fff', color: ORANGE_DARK, boxShadow: CARD_SHADOW }}>
          Skip — no PIN
        </button>
      </div>
    </FlowContainer>
  );
}

// ============ ASSESSMENT EMAIL BUILDER ============
function buildAssessmentEmail(name, assessment, signatures, hrForms, emergencyContact) {
  const ratings = assessment.ratings || {};
  const fillIns = assessment.fillIns || {};
  const ratingsArr = Object.values(ratings);
  const avg = ratingsArr.length > 0 ? (ratingsArr.reduce((a,b) => a+b, 0) / ratingsArr.length).toFixed(1) : 'N/A';
  
  const RATING_LABELS = ['','Customer service','Building rapport','Furniture knowledge','Mattress knowledge','Sales skills','Listening','Computer skills','iPad/tablet skills','Organization','Handling rejection','Demo features/benefits','Coaching openness','Project follow-through','Punctuality'];
  const FILL_LABELS = {
    15: 'Largest furniture manufacturer (world)',
    16: 'Largest furniture retailer (US)',
    17: '#1 mattress brand in America',
    18: 'Most important part of any sales process',
    19: 'Average price of a queen mattress set sold',
    20: 'All mattress sizes',
    21: 'Most important part of selling mattresses',
  };
  
  let body = `PRE-TRAINING ASSESSMENT\n`;
  body += `Trainee: ${name}\n`;
  body += `Completed: ${new Date(assessment.completedAt || Date.now()).toLocaleString()}\n\n`;
  
  body += `=== SELF-RATINGS (1-10) ===\n`;
  body += `Average: ${avg} / 10\n\n`;
  for (let i = 1; i <= 14; i++) {
    body += `${i}. ${RATING_LABELS[i]}: ${ratings[i] || '—'}\n`;
  }
  
  body += `\n=== KNOWLEDGE CHECK ===\n`;
  for (let i = 15; i <= 21; i++) {
    body += `Q: ${FILL_LABELS[i]}\nA: ${fillIns[i] || '(no answer)'}\n\n`;
  }
  
  body += `=== HOPE FOR TRAINING ===\n${assessment.hope || '(none given)'}\n\n`;
  
  body += `=== ACKNOWLEDGMENTS ===\n`;
  body += `Non-Negotiables: ${signatures?.nonNegotiables ? 'Signed by ' + signatures.nonNegotiables.fullName + ' on ' + signatures.nonNegotiables.date : 'NOT SIGNED'}\n`;
  body += `Hygiene & Dress Code: ${signatures?.hygiene ? 'Signed by ' + signatures.hygiene.fullName + ' on ' + signatures.hygiene.date : 'NOT SIGNED'}\n`;
  body += `Pay & Bonus: ${signatures?.payBonus ? 'Signed by ' + signatures.payBonus.fullName + ' on ' + signatures.payBonus.date : 'NOT SIGNED'}\n\n`;
  
  body += `=== HR FORMS STATUS ===\n`;
  body += `I-9: ${hrForms?.i9 ? '✓' : 'pending'}\n`;
  body += `W-4: ${hrForms?.w4 ? '✓' : 'pending'}\n`;
  body += `Direct Deposit: ${hrForms?.dd ? '✓' : 'pending'}\n`;
  body += `Background Check: ${hrForms?.bg ? '✓' : 'pending'}\n\n`;
  
  body += `=== EMERGENCY CONTACT ===\n`;
  if (emergencyContact?.name) {
    body += `${emergencyContact.name} (${emergencyContact.relationship || '—'}) — ${emergencyContact.phone || '—'}\n`;
  } else {
    body += `Not provided.\n`;
  }
  
  return body;
}

function RatingPage({ q, value, onChange, progress, progressPct, onPrev, onNext, canNext }) {
  return (
    <div className="flex flex-col" style={{ minHeight: '750px' }}>
      <div className="px-6 pt-6 pb-4" style={{ background: '#fff' }}>
        <div className="flex justify-between items-baseline mb-2">
          <div className="text-[10px] font-bold tracking-widest" style={{ color: MID }}>SELF-RATING · {progress}</div>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: LIGHT_BG }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: ORANGE }} />
        </div>
      </div>
      
      <div className="px-6 pt-8 flex-1">
        <div className="text-xl font-bold leading-snug mb-6" style={{ color: DARK }}>{q.t}</div>
        
        <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
          <div className="flex justify-between items-center mb-3">
            <div className="text-[10px] font-bold tracking-widest" style={{ color: MID }}>YOUR RATING</div>
            <div className="text-3xl font-bold" style={{ color: value ? ORANGE_DARK : IOS_LABEL_3, fontVariantNumeric: 'tabular-nums' }}>
              {value || '—'}
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => onChange(n)} className="aspect-square rounded-lg text-xs font-bold transition-all" style={{ background: value === n ? ORANGE : LIGHT_BG, color: value === n ? '#fff' : DARK }}>
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px]" style={{ color: MID }}>
            <span>1 — Lowest</span>
            <span>10 — Highest</span>
          </div>
        </div>
      </div>
      
      <div className="px-6 pb-6 pt-2 flex gap-2">
        <button onClick={onPrev} className="px-5 py-4 rounded-2xl text-sm font-bold" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>Back</button>
        <button onClick={onNext} disabled={!canNext} className="flex-1 py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98] disabled:opacity-40" style={{ background: ORANGE, boxShadow: '0 4px 14px rgba(243,117,32,0.35)' }}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function FillPage({ q, value, onChange, progress, progressPct, onPrev, onNext, finalLabel, big }) {
  return (
    <div className="flex flex-col" style={{ minHeight: '750px' }}>
      <div className="px-6 pt-6 pb-4" style={{ background: '#fff' }}>
        <div className="flex justify-between items-baseline mb-2">
          <div className="text-[10px] font-bold tracking-widest" style={{ color: MID }}>{big ? 'FINAL QUESTION' : 'KNOWLEDGE CHECK'} · {progress}</div>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: LIGHT_BG }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: ORANGE }} />
        </div>
      </div>
      
      <div className="px-6 pt-8 flex-1">
        <div className="text-xl font-bold leading-snug mb-4" style={{ color: DARK }}>{q.t}</div>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer here..."
          className="w-full p-4 text-base rounded-2xl focus:outline-none"
          style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW, minHeight: big ? '180px' : '120px', resize: 'none' }}
        />
        <div className="text-[10px] mt-2" style={{ color: MID }}>"I don't know" is fine. Honesty beats guessing.</div>
      </div>
      
      <div className="px-6 pb-6 pt-2 flex gap-2">
        <button onClick={onPrev} className="px-5 py-4 rounded-2xl text-sm font-bold" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>Back</button>
        <button onClick={onNext} className="flex-1 py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98]" style={{ background: ORANGE, boxShadow: '0 4px 14px rgba(243,117,32,0.35)' }}>
          {finalLabel || 'Continue →'}
        </button>
      </div>
    </div>
  );
}

// ============ RATING BATCH (multiple ratings per screen) ============
function RatingBatch({ questions, ratings, onChange, progress, progressPct, onPrev, onNext, canNext }) {
  return (
    <div className="flex flex-col" style={{ minHeight: '750px' }}>
      <div className="px-6 pt-6 pb-4" style={{ background: '#fff' }}>
        <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>{progress}</div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: LIGHT_BG }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: ORANGE }} />
        </div>
      </div>
      
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <div className="text-[11px] mb-3" style={{ color: MID }}>Rate yourself 1 (lowest) to 10 (highest). Be honest — your trainer uses this to coach to where you actually are.</div>
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-2xl p-3 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="flex justify-between items-start mb-2 gap-2">
              <div className="text-[13px] font-semibold leading-snug flex-1" style={{ color: DARK }}>{q.t}</div>
              <div className="text-2xl font-bold flex-shrink-0" style={{ color: ratings[q.id] ? ORANGE_DARK : IOS_LABEL_3, fontVariantNumeric: 'tabular-nums', minWidth: '32px', textAlign: 'right' }}>
                {ratings[q.id] || '—'}
              </div>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => onChange(q.id, n)}
                  className="aspect-square rounded-md text-[10px] font-bold transition-all"
                  style={{ background: ratings[q.id] === n ? ORANGE : LIGHT_BG, color: ratings[q.id] === n ? '#fff' : DARK }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="text-[10px] text-center mb-2" style={{ color: MID }}>{questions.filter(q => ratings[q.id] != null).length} of {questions.length} answered</div>
      </div>
      
      <div className="px-6 pb-6 pt-2 flex gap-2">
        <button onClick={onPrev} className="px-5 py-4 rounded-2xl text-sm font-bold" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>Back</button>
        <button onClick={onNext} disabled={!canNext} className="flex-1 py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98] disabled:opacity-40" style={{ background: ORANGE, boxShadow: '0 4px 14px rgba(243,117,32,0.35)' }}>
          Continue →
        </button>
      </div>
    </div>
  );
}

// ============ FILL BATCH (all fill-ins on one screen) ============
function FillBatch({ questions, answers, onChange, progress, progressPct, onPrev, onNext }) {
  return (
    <div className="flex flex-col" style={{ minHeight: '750px' }}>
      <div className="px-6 pt-6 pb-4" style={{ background: '#fff' }}>
        <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>{progress}</div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: LIGHT_BG }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: ORANGE }} />
        </div>
      </div>
      
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <div className="text-[11px] mb-3" style={{ color: MID }}>Quick answers about furniture. &ldquo;I don&rsquo;t know&rdquo; is fine — honesty beats guessing.</div>
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-2xl p-3 mb-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-[12px] font-semibold leading-snug mb-2" style={{ color: DARK }}>{q.t}</div>
            <textarea
              value={answers[q.id] || ''}
              onChange={(e) => onChange(q.id, e.target.value)}
              placeholder="Your answer…"
              className="w-full p-2 text-[13px] rounded-lg focus:outline-none"
              style={{ background: LIGHT_BG, color: DARK, minHeight: '50px', resize: 'none', border: 'none' }}
            />
          </div>
        ))}
      </div>
      
      <div className="px-6 pb-6 pt-2 flex gap-2">
        <button onClick={onPrev} className="px-5 py-4 rounded-2xl text-sm font-bold" style={{ background: '#fff', color: DARK, boxShadow: CARD_SHADOW }}>Back</button>
        <button onClick={onNext} className="flex-1 py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98]" style={{ background: ORANGE, boxShadow: '0 4px 14px rgba(243,117,32,0.35)' }}>
          Continue →
        </button>
      </div>
    </div>
  );
}

// ============ MANAGER'S INTRODUCTION ============
function ManagerIntroContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>The Move</div>
          <div className="text-xs" style={{ color: DARK }}>A turnover is about advancing the guest experience, not just bringing in a manager. Done right, the guest feels elevated. Done wrong, they feel passed off.</div>
        </div>
      </div>
      
      <Section title="WHEN TO TURN OVER">
        <Bullets items={[
          'You\'ve cycled through your sale and need fresh eyes.',
          'The guest has objections you can\'t close on alone.',
          'They\'re asking for a discount or pricing beyond your authority.',
          'Special requests that need approval — custom orders, holds, special pricing.',
          'Complex financing situations or unusual ticket structures.',
          'Anytime adding the manager actually helps the guest move forward.',
        ]} />
      </Section>
      
      <Section title="THE 6 STEPS">
        {[
          ['INTRODUCE THE GUEST', 'Provide their name. Personally introduce them to the MOD. Eye contact between guest and manager.'],
          ['STATE THEIR GOAL', 'What they\'re shopping for. Be specific. "They\'re looking for a sectional to fit a 12x18 space."'],
          ['EXPLAIN THE SITUATION', 'The 3 R\'s — Remodeling, Replacing, or Relocating. Urgent or long-term?'],
          ['SHARE PROGRESS', 'What you\'ve already shown, discussed, or ruled out. Don\'t make the manager start over.'],
          ['HIGHLIGHT CONCERNS', 'Objections, budget constraints, special considerations. Be honest — manager needs the real picture.'],
          ['TRANSITION SMOOTHLY', 'Hand off confidently. The guest is being elevated, not handed off.'],
        ].map(([t, d], i) => (
          <div key={i} className="flex items-start gap-2.5 mb-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ORANGE }}>
              <div className="text-xs font-bold text-white">{i+1}</div>
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold" style={{ color: DARK }}>{t}</div>
              <div className="text-[11px]" style={{ color: MID }}>{d}</div>
            </div>
          </div>
        ))}
      </Section>
      
      <Section title="THE 3 Rs · CONTEXT YOU OWE THE MANAGER">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            ['REMODEL', 'Updating a space they live in. Often patient — wants the right piece, less price-sensitive.'],
            ['REPLACE', 'Swapping something broken or worn. Often urgent — need it now.'],
            ['RELOCATE', 'Moving to a new home. Big tickets, often time-sensitive to delivery date.'],
          ].map(([w, t], i) => (
            <div key={i} className="rounded-lg p-2.5 text-center" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-bold mb-1" style={{ color: ORANGE_DARK }}>{w}</div>
              <div className="text-[10px]" style={{ color: MID }}>{t}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px]" style={{ color: MID }}>Tell the manager which one. It changes how they approach the guest.</div>
      </Section>
      
      <Section title="THE INTRO SCRIPT">
        <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-xs italic" style={{ color: DARK }}>
            &ldquo;[Manager], I&rsquo;d like you to meet [Guest Name]. They&rsquo;re looking for a [specific item] for their [room]. They&rsquo;re [remodeling / replacing / relocating], and we&rsquo;ve been comparing [options]. [Manager] has a lot of experience with [specific area] and can help us [specific outcome].&rdquo;
          </div>
        </div>
      </Section>
      
      <Section title="THE COMEBACK SCRIPT">
        <div className="text-[11px] mb-2" style={{ color: MID }}>When the manager has approved something or come up with a new offer:</div>
        <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="text-xs italic" style={{ color: DARK }}>
            &ldquo;Hi [Guest Name], I just spoke with [Manager] and we have a special offer for you. We can [details]. I think this addresses what you were asking about [their concern]. Does this work?&rdquo;
          </div>
        </div>
      </Section>
      
      <Section title="WHAT NOT TO DO">
        <Bullets items={[
          'Don\'t say "I\'ll get my manager" and walk away cold. Always introduce by name.',
          'Don\'t turn over with no context. Manager has to start the relationship from zero.',
          'Don\'t hide objections from the manager. They need the real picture to help.',
          'Don\'t turn over too early. Try to handle objections yourself first — managers are reinforcement, not the front line.',
          'Don\'t turn over too late. If you\'ve cycled and they\'re leaving, you waited too long.',
        ]} />
      </Section>
      
      <RememberCard text="The turnover is the move that doubles your close rate when you do it right. Introduce. Goal. Situation. Progress. Concerns. Transition." />
    </>
  );
}


function NonNegotiablesContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="rounded-2xl p-4" style={{ background: ORANGE_TINT, border: `2px solid ${ORANGE}` }}>
          <div className="text-sm font-bold mb-2" style={{ color: ORANGE_DARK }}>Mandatory expectations — not optional.</div>
          <div className="text-xs italic" style={{ color: DARK }}>Without commitment, we have nothing. Success requires everyone to fully commit to following directions and executing every task necessary to achieve our goals.</div>
        </div>
      </div>
      
      <Section title="THE SEVEN">
        <NonNegotiableCard num="1" title="Punctuality & Attendance" body="Arrive on time, clocked in, and ready to serve guests at the start of your shift. Being late disrupts the team and the guest experience. Reliability is non-negotiable." />
        <NonNegotiableCard num="2" title="Turnovers" body="An effective turnover is critical to helping guests and closing sales. Done right, the guest feels elevated — not passed off." />
        <NonNegotiableCard num="3" title="Rest Tests" body="7 per week — NO EXCEPTIONS. Weekly standard, cannot be made up later. Consistency is key. (91 per quarter to qualify for bonus.)" />
        <NonNegotiableCard num="4" title="Undelivered Report Communication" body="Review your undelivered orders weekly and personally update each guest on their status. Document every interaction in the system. Guests should never have to call us first to ask, &lsquo;Where is my order?&rsquo;" />
        <NonNegotiableCard num="5" title="Cleanliness & Presentation" body="Your area is a direct reflection of you and Ashley. Keep your section showroom-ready at all times — floors clean, tags correct, displays neat, nothing out of place. Damaged, dirty, or missing? Fix it or escalate." />
        <NonNegotiableCard num="6" title="Follow-Up" body="Every guest interaction includes gathering full contact info. For walk-outs: at least 5 follow-ups (calls, texts, emails). Track every one. Always provide value — updates, promotions, alternatives." />
        <NonNegotiableCard num="7" title="Appearance" body="Business casual at all times unless otherwise specified. Refer to the Workplace Hygiene & Dress Code Policy." last />
      </Section>
      
      <Section title="TURNOVER · THE 6 STEPS">
        <div className="text-xs mb-3" style={{ color: MID }}>A turnover is about advancing the guest experience, not just bringing in a manager.</div>
        {[
          ['INTRODUCE THE GUEST', 'Provide their name. Personally introduce them to the MOD.'],
          ['STATE THEIR GOAL', 'What they\'re shopping for. Be specific. "Sectional to fit a 12x18 space."'],
          ['EXPLAIN THE SITUATION', 'The 3 R\'s — are they Remodeling, Replacing, or Relocating? Urgent or long-term?'],
          ['SHARE PROGRESS', 'What you\'ve already shown, discussed, or ruled out.'],
          ['HIGHLIGHT CONCERNS', 'Objections, budget constraints, special considerations.'],
          ['TRANSITION SMOOTHLY', 'Hand off confidently. The guest is being elevated, not passed off.'],
        ].map(([t, d], i) => (
          <div key={i} className="flex items-start gap-2.5 mb-2.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ORANGE }}>
              <div className="text-[10px] font-bold text-white">{i+1}</div>
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold" style={{ color: DARK }}>{t}</div>
              <div className="text-[11px]" style={{ color: MID }}>{d}</div>
            </div>
          </div>
        ))}
      </Section>
      
      <Section title="THE 3 Rs">
        <div className="rounded-lg p-3" style={{ background: LIGHT_BG }}>
          <div className="grid grid-cols-3 gap-2">
            {[['REMODEL', 'Updating a space they live in'], ['REPLACE', 'Swapping something broken or worn'], ['RELOCATE', 'Moving to a new home']].map(([w, t], i) => (
              <div key={i} className="rounded-lg p-2 text-center" style={{ background: '#fff' }}>
                <div className="text-[10px] font-bold" style={{ color: ORANGE_DARK }}>{w}</div>
                <div className="text-[10px] mt-1" style={{ color: MID }}>{t}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] mt-2 text-center" style={{ color: MID }}>Knowing which one tells the manager (and you) how urgent and how flexible the guest is.</div>
        </div>
      </Section>
      
      <RememberCard text="Commitment is the foundation. Hold these seven and the rest takes care of itself." />
    </>
  );
}
// ============ STUB (backlog cheats) ============
function StubContent({ name }) {
  return (
    <div className="px-6 pt-6">
      <div className="rounded-2xl p-5 text-center" style={{ background: '#fff', border: `2px dashed ${ORANGE}` }}>
        <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: ORANGE_TINT }}>
          <FileText size={20} style={{ color: ORANGE_DARK }} />
        </div>
        <div className="text-sm font-bold mb-1" style={{ color: DARK }}>{name}</div>
        <div className="text-xs" style={{ color: MID }}>Cheat content lands in the next content build. The schedule block is in the day plan; the trainer covers it live until the cheat ships.</div>
      </div>
    </div>
  );
}
function HygieneContent() {
  return (
    <>
      <div className="px-6 pt-5">
        <div className="text-xs" style={{ color: MID }}>Your appearance directly impacts the guest experience. The following is mandatory.</div>
      </div>
      
      <Section title="PERSONAL HYGIENE">
        {['Bathe daily. Wear clean, wrinkle-free attire.', 'Brush teeth, fresh breath.', 'Use deodorant.', 'Avoid heavy perfumes/colognes.', 'Trim and maintain nails.', 'Wash hands often.'].map((t, i) => (
          <div key={i} className="text-xs mb-1.5 pl-3 relative" style={{ color: DARK }}>
            <span className="absolute left-0" style={{ color: ORANGE }}>•</span>{t}
          </div>
        ))}
      </Section>
      
      <Section title="DRESS CODE">
        <div className="space-y-2">
          {[['Men', 'Ashley button-up, slacks, dress shoes. Tucked in.'], ['Women', 'Ashley dress tops, slacks, closed-toe dress shoes.'], ['Polos', 'Ashley polos weekends only, dress slacks, name tag.'], ['Not allowed', 'Tennis shoes, Crocs, Vans, Converse.']].map(([who, what], i) => (
            <div key={i} className="rounded-lg p-2.5" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-bold mb-0.5" style={{ color: ORANGE_DARK }}>{who}</div>
              <div className="text-xs" style={{ color: DARK }}>{what}</div>
            </div>
          ))}
        </div>
      </Section>
      
      <RememberCard text="Failure to follow the dress code = sent home to change. Your appearance is part of your professionalism." />
    </>
  );
}

// ============ HELPERS ============
function Section({ title, subtitle, children }) {
  return (
    <div className="px-6 pt-5">
      <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: ORANGE_DARK }}>{title}</div>
      {subtitle && <div className="text-xs mb-3" style={{ color: MID }}>{subtitle}</div>}
      <div>{children}</div>
    </div>
  );
}

function RememberCard({ text }) {
  return (
    <div className="px-6 pt-6">
      <div className="rounded-2xl p-4" style={{ background: DARK }}>
        <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: ORANGE }}>IF YOU REMEMBER NOTHING ELSE</div>
        <div className="text-sm leading-relaxed text-white">{text}</div>
      </div>
    </div>
  );
}

// ============ QUIZ HOME ============
function QuizHome({ quizScores, dayUnlocked, startQuiz, trainerMode }) {
  return (
    <div className="pb-4">
      <div className="px-6 pt-6 pb-4">
        <div className="text-xs font-bold tracking-widest" style={{ color: MID }}>ASSESSMENTS</div>
        <div className="text-2xl font-bold mt-1" style={{ color: DARK }}>Quizzes</div>
      </div>
      
      <div className="px-6 space-y-3">
        {[1,2,3,4,5,6].map(d => {
          const unlocked = dayUnlocked(d) || trainerMode;
          const score = quizScores[d];
          const passed = score?.passed;
          const quiz = quizzes[d];
          
          return (
            <div key={d} className="rounded-2xl p-4" style={{ background: unlocked ? '#fff' : LIGHT_BG, border: `${passed ? 2 : 1}px solid ${passed ? GREEN : (unlocked ? ORANGE_TINT : BORDER)}`, opacity: unlocked ? 1 : 0.5 }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: passed ? GREEN : (unlocked ? ORANGE_DARK : MID) }}>
                    DAY {d} {passed ? '• PASSED' : (unlocked ? '• READY' : '• LOCKED')}
                  </div>
                  <div className="text-sm font-bold" style={{ color: DARK }}>{quiz.name.replace(`Day ${d}: `, '')}</div>
                  <div className="text-xs mt-0.5" style={{ color: MID }}>{quiz.questions.length} questions • {quiz.pass}% to pass</div>
                </div>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: passed ? GREEN : (unlocked ? ORANGE_TINT : BORDER) }}>
                  {passed ? <Check size={18} className="text-white" strokeWidth={3} /> : (unlocked ? <ClipboardCheck size={18} style={{ color: ORANGE_DARK }} /> : <Lock size={16} style={{ color: MID }} />)}
                </div>
              </div>
              {score && (
                <div className="text-xs mb-3" style={{ color: MID }}>Last score: <span className="font-bold" style={{ color: passed ? GREEN : RED }}>{score.score}/{score.total} ({score.pct}%)</span></div>
              )}
              {unlocked && (
                <button onClick={() => startQuiz(d)} className="w-full py-2.5 rounded-lg text-sm font-bold text-white active:scale-98 transition-transform" style={{ background: passed ? GREEN : ORANGE }}>
                  {score ? 'Retake' : 'Start'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ QUIZ ACTIVE ============
function QuizActive({ day, qIdx, setQIdx, answers, setAnswers, showResult, setShowResult, onFinish, onExit }) {
  const quiz = quizzes[day];
  const q = quiz.questions[qIdx];
  const selected = answers[qIdx];
  const isCorrect = selected === q.correct;
  
  const submit = (i) => {
    setAnswers({ ...answers, [qIdx]: i });
    setShowResult(true);
  };
  
  const next = () => {
    setShowResult(false);
    if (qIdx + 1 >= quiz.questions.length) onFinish();
    else setQIdx(qIdx + 1);
  };
  
  return (
    <div className="pb-6 flex flex-col" style={{ minHeight: '700px' }}>
      <div className="px-6 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold tracking-widest" style={{ color: MID }}>Q {qIdx + 1} of {quiz.questions.length}</div>
          <button onClick={onExit} className="text-xs font-medium" style={{ color: MID }}>Exit</button>
        </div>
        <div className="flex gap-1">
          {quiz.questions.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= qIdx ? ORANGE : BORDER }} />
          ))}
        </div>
      </div>
      
      <div className="px-6 pt-3 pb-4 flex-1">
        <div className="text-base font-bold leading-tight mb-5" style={{ color: DARK }}>{q.q}</div>
        <div className="space-y-2">
          {q.choices.map((c, i) => {
            const isSelected = selected === i;
            const isThis = i === q.correct;
            let bg = '#fff', border = BORDER, labelBg = LIGHT_BG, labelColor = MID;
            if (showResult) {
              if (isThis) { bg = '#EDF7ED'; border = GREEN; labelBg = GREEN; labelColor = '#fff'; }
              else if (isSelected) { bg = '#FCEDED'; border = RED; labelBg = RED; labelColor = '#fff'; }
            } else if (isSelected) { border = ORANGE; labelBg = ORANGE; labelColor = '#fff'; }
            
            return (
              <button key={i} onClick={() => !showResult && submit(i)} disabled={showResult} className="w-full text-left rounded-xl p-3 flex items-start gap-3 active:scale-98 transition-all" style={{ background: bg, border: `2px solid ${border}` }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: labelBg, color: labelColor }}>
                  {showResult && isThis ? <Check size={12} strokeWidth={3} /> : (showResult && isSelected ? <X size={12} strokeWidth={3} /> : ['A','B','C','D'][i])}
                </div>
                <div className="text-xs pt-0.5" style={{ color: DARK }}>{c}</div>
              </button>
            );
          })}
        </div>
      </div>
      
      {showResult && (
        <div className="px-6 pb-4">
          <div className="rounded-xl p-3 mb-3" style={{ background: isCorrect ? '#EDF7ED' : '#FCEDED', border: `1px solid ${isCorrect ? GREEN : RED}` }}>
            <div className="text-xs font-bold tracking-widest mb-1" style={{ color: isCorrect ? '#3D6B3D' : '#A33' }}>{isCorrect ? '✓ CORRECT' : '✗ NOT QUITE'}</div>
            <div className="text-xs" style={{ color: DARK }}>{q.explain}</div>
          </div>
          <button onClick={next} className="w-full py-3 rounded-xl text-sm font-bold text-white active:scale-98" style={{ background: ORANGE }}>
            {qIdx + 1 >= quiz.questions.length ? 'See Results' : 'Next Question'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============ QUIZ RESULTS ============
function QuizResults({ day, answers, score, onRetry, onExit, traineeName, trainerEmail, completedDays, quizScores, signatures, hrForms, assessment }) {
  const quiz = quizzes[day];
  const passed = score?.passed;
  const [sent, setSent] = useState(false);
  
  const sendScoreEmail = () => {
    const today = new Date().toLocaleDateString();
    const missed = quiz.questions
      .map((q, i) => ({ q, i, ok: answers[i] === q.correct }))
      .filter(x => !x.ok);
    
    let body = `DAY ${day} QUIZ — ${quiz.name || 'Quiz'}\n`;
    body += `Trainee: ${traineeName}\n`;
    body += `Date: ${today}\n`;
    body += `\n=== SCORE ===\n`;
    body += `${score.score} / ${score.total}   (${score.pct}%)   ${passed ? 'PASSED' : 'NOT PASSED'}\n`;
    body += `Pass threshold: ${quiz.pass}%\n`;
    
    if (missed.length > 0) {
      body += `\n=== MISSED QUESTIONS (${missed.length}) ===\n`;
      missed.forEach(({ q, i }) => {
        body += `\nQ${i+1}: ${q.q}\n`;
        body += `Trainee answered: ${q.choices[answers[i]] || '(no answer)'}\n`;
        body += `Correct answer: ${q.choices[q.correct]}\n`;
        if (q.explain) body += `Why: ${q.explain}\n`;
      });
    } else {
      body += `\nAll questions answered correctly.\n`;
    }
    
    body += `\n---\nSent from The Launch app`;
    
    const subject = encodeURIComponent(`Day ${day} Quiz — ${traineeName} — ${score.pct}%`);
    window.open(`mailto:${trainerEmail}?subject=${subject}&body=${encodeURIComponent(body)}`, '_blank');
    setSent(true);
  };
  
  const sendCompletionReport = () => {
    const today = new Date().toLocaleDateString();
    const allScores = Object.keys(quizScores).map(d => ({ d: parseInt(d), s: quizScores[d] }));
    const avgPct = allScores.length > 0
      ? Math.round(allScores.reduce((a, x) => a + (x.s?.pct || 0), 0) / allScores.length)
      : 0;
    
    let body = `COMPLETION REPORT — ${traineeName}\n`;
    body += `Date: ${today}\n`;
    body += `\n=== PROGRAM SUMMARY ===\n`;
    body += `Days completed: ${completedDays.length} of 6\n`;
    body += `Quizzes taken: ${allScores.length}\n`;
    body += `Average quiz score: ${avgPct}%\n`;
    
    body += `\n=== QUIZ SCORES BY DAY ===\n`;
    for (let d = 1; d <= 6; d++) {
      const s = quizScores[d];
      if (s) {
        body += `Day ${d}: ${s.score}/${s.total} = ${s.pct}% — ${s.passed ? 'PASSED' : 'NOT PASSED'}\n`;
      } else {
        body += `Day ${d}: not taken\n`;
      }
    }
    
    body += `\n=== SIGNATURES ===\n`;
    body += `Non-Negotiables: ${signatures?.nonNegotiables ? 'Signed by ' + signatures.nonNegotiables.fullName + ' on ' + signatures.nonNegotiables.date : 'NOT SIGNED'}\n`;
    body += `Hygiene & Dress Code: ${signatures?.hygiene ? 'Signed by ' + signatures.hygiene.fullName + ' on ' + signatures.hygiene.date : 'NOT SIGNED'}\n`;
    body += `Pay & Bonus Plan: ${signatures?.payBonus ? 'Signed by ' + signatures.payBonus.fullName + ' on ' + signatures.payBonus.date : 'NOT SIGNED'}\n`;
    
    body += `\n=== HR FORMS ===\n`;
    body += `I-9: ${hrForms?.i9 ? '✓' : 'pending'}\n`;
    body += `W-4: ${hrForms?.w4 ? '✓' : 'pending'}\n`;
    body += `Direct Deposit: ${hrForms?.dd ? '✓' : 'pending'}\n`;
    body += `Background: ${hrForms?.bg ? '✓' : 'pending'}\n`;
    
    if (assessment) {
      const ratingsArr = Object.values(assessment.ratings || {});
      const ratingAvg = ratingsArr.length > 0 ? (ratingsArr.reduce((a,b) => a+b, 0) / ratingsArr.length).toFixed(1) : 'N/A';
      body += `\n=== ORIGINAL PRE-TRAINING ASSESSMENT ===\n`;
      body += `Self-rating average at start: ${ratingAvg} / 10\n`;
      if (assessment.hope) body += `Hope for training: "${assessment.hope}"\n`;
    }
    
    body += `\n---\nSent from The Launch app`;
    
    const subject = encodeURIComponent(`Training Complete — ${traineeName}`);
    window.open(`mailto:${trainerEmail}?subject=${subject}&body=${encodeURIComponent(body)}`, '_blank');
    setSent(true);
  };
  
  const isFinalDay = day === 6 && passed;
  
  return (
    <div className="pb-6 flex flex-col" style={{ minHeight: '700px' }}>
      <div className="w-full px-6 pt-10 pb-7 flex flex-col items-center" style={{ background: passed ? `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)` : '#2A2A2A' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(255,255,255,0.2)' }}>
          <Award size={28} className="text-white" strokeWidth={2} />
        </div>
        <div className="text-[10px] font-bold tracking-widest text-white/80 mb-1">{passed ? 'GREAT WORK' : 'KEEP GOING'}</div>
        <div className="text-4xl font-bold text-white mb-1">{score.score}/{score.total}</div>
        <div className="text-xs text-white/90">{score.pct}% • {passed ? `Day ${day} Passed` : `Need ${quiz.pass}% to pass`}</div>
      </div>
      
      {passed && day < 6 && (
        <div className="px-6 pt-4">
          <div className="rounded-xl p-3" style={{ background: ORANGE_TINT, border: `1px solid ${ORANGE}` }}>
            <div className="text-xs font-bold flex items-center gap-2" style={{ color: ORANGE_DARK }}>
              <Sparkles size={14} /> Day {day + 1} Unlocked
            </div>
          </div>
        </div>
      )}
      
      {isFinalDay && (
        <div className="px-6 pt-4">
          <div className="rounded-xl p-3" style={{ background: '#FFF6E8', border: `2px solid ${ORANGE}` }}>
            <div className="text-xs font-bold mb-1 flex items-center gap-2" style={{ color: ORANGE_DARK }}>
              <Award size={14} /> Final Cert Earned — The Launch Complete
            </div>
            <div className="text-[11px]" style={{ color: DARK }}>You've finished the program. Send your trainer the full completion report below.</div>
          </div>
        </div>
      )}
      
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <div className="text-xs font-bold tracking-widest mb-2" style={{ color: MID }}>BREAKDOWN</div>
        {quiz.questions.map((q, i) => {
          const ok = answers[i] === q.correct;
          return (
            <div key={i} className="flex items-start gap-2 mb-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ok ? GREEN : RED }}>
                {ok ? <Check size={10} className="text-white" strokeWidth={3} /> : <X size={10} className="text-white" strokeWidth={3} />}
              </div>
              <div className="flex-1 text-xs" style={{ color: DARK }}>{q.q}</div>
            </div>
          );
        })}
      </div>
      
      <div className="px-6 pb-4">
        {sent && (
          <div className="rounded-xl p-2.5 mb-2 flex items-center gap-2" style={{ background: '#E5F8EC', border: `1px solid ${GREEN}` }}>
            <Check size={14} style={{ color: GREEN }} strokeWidth={3} />
            <div className="text-xs font-bold" style={{ color: '#1A8A3E' }}>Email opened. Tap send in your mail app.</div>
          </div>
        )}
        
        {isFinalDay ? (
          <button onClick={sendCompletionReport} className="w-full py-3 rounded-xl text-sm font-bold text-white active:scale-98 mb-2" style={{ background: ORANGE }}>
            📧 Send Completion Report to Trainer
          </button>
        ) : (
          <button onClick={sendScoreEmail} className="w-full py-3 rounded-xl text-sm font-bold text-white active:scale-98 mb-2" style={{ background: ORANGE }}>
            📧 Send Score to Trainer
          </button>
        )}
        
        <div className="flex gap-2 mt-2">
          <button onClick={onRetry} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: '#fff', color: ORANGE_DARK, border: `1px solid ${BORDER}` }}>Retake</button>
          <button onClick={onExit} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ background: '#fff', color: DARK, border: `1px solid ${BORDER}` }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ============ PAY (SALES LEDGER) ============
function PayView({ bonus, setBonus }) {
  const [scope, setScope] = useState('period'); // 'period' | 'quarter'
  const [showSettings, setShowSettings] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [confirmReset, setConfirmReset] = useState(null);
  
  const log = bonus.log || [];
  const periodStart = bonus.periodStart || 0;
  const quarterStart = bonus.quarterStart || 0;
  const rateTier = bonus.rateTier || 0;
  const rate = RATE_LADDER[rateTier];
  
  const since = scope === 'period' ? periodStart : quarterStart;
  const scopedLog = log.filter(s => s.ts >= since);
  
  const sumBy = (type) => scopedLog.filter(s => s.type === type).reduce((sum, s) => sum + s.amount, 0);
  const furn = sumBy('F');
  const bed = sumBy('B');
  const safe = sumBy('S');
  const del = sumBy('D');
  const totalVolume = furn + bed + safe + del;
  
  const furnComm = (furn + bed) * rate.furniture;
  const safeComm = safe * rate.safelock;
  const totalEarned = furnComm + safeComm;
  
  const logSale = (type, amount) => {
    if (!amount || amount <= 0) return;
    const entry = { id: Date.now() + Math.random(), ts: Date.now(), type, amount };
    setBonus({ ...bonus, log: [...log, entry] });
    setShowSheet(false);
  };
  const removeSale = (id) => setBonus({ ...bonus, log: log.filter(s => s.id !== id) });
  const doReset = (which) => {
    const now = Date.now();
    if (which === 'period') setBonus({ ...bonus, periodStart: now });
    else if (which === 'quarter') setBonus({ ...bonus, quarterStart: now, qMargin: 53, qHours: 0, qRT: 0 });
    setConfirmReset(null);
  };
  
  return (
    <div className="pb-6 relative" style={{ background: IOS_BG, minHeight: '700px' }}>
      {/* HERO — Apple Wallet-style balance card */}
      <div className="px-5 pt-5 pb-7" style={{ background: `linear-gradient(160deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)` }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex bg-white/15 rounded-full p-0.5 backdrop-blur-sm">
            <button onClick={() => setScope('period')} className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-all" style={{ background: scope === 'period' ? '#fff' : 'transparent', color: scope === 'period' ? ORANGE_DARK : '#fff' }}>PERIOD</button>
            <button onClick={() => setScope('quarter')} className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-all" style={{ background: scope === 'quarter' ? '#fff' : 'transparent', color: scope === 'quarter' ? ORANGE_DARK : '#fff' }}>QUARTER</button>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="text-white/80 active:scale-95">
            <Settings size={16} />
          </button>
        </div>
        <div className="text-[10px] font-bold tracking-widest text-white/80 mt-3">EARNED</div>
        <div className="text-white mt-0.5 leading-none" style={{ fontSize: '52px', fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {FMT_MONEY(totalEarned)}
        </div>
        <div className="text-xs text-white/85 mt-2">
          {scope === 'period'
            ? (periodStart > 0 ? `Period started ${fmtDate(periodStart)} · ${scopedLog.length} sales` : `${scopedLog.length} sales tracked`)
            : (quarterStart > 0 ? `Quarter started ${fmtDate(quarterStart)}` : `${scopedLog.length} sales tracked`)
          }
        </div>
      </div>
      
      {showSettings && (
        <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
          <div className="px-4 pt-3 pb-1.5 text-[10px] font-bold tracking-widest" style={{ color: IOS_LABEL_2 }}>COMMISSION RATE</div>
          {RATE_LADDER.map((r, i) => (
            <button key={i} onClick={() => setBonus({...bonus, rateTier: i})} className="w-full flex justify-between items-center px-4 py-2.5" style={{ borderTop: i === 0 ? 'none' : `0.5px solid ${IOS_HAIRLINE}` }}>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: rateTier === i ? ORANGE : '#fff', border: `1.5px solid ${rateTier === i ? ORANGE : IOS_LABEL_3}` }}>
                  {rateTier === i && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="text-sm" style={{ color: DARK }}>{r.label}</div>
              </div>
              <div className="text-xs font-semibold" style={{ color: IOS_LABEL_2 }}>{(r.furniture*100).toFixed(1)}% / {(r.safelock*100).toFixed(1)}%</div>
            </button>
          ))}
        </div>
      )}
      
      {/* LOG SALE BUTTON — single big primary CTA */}
      <div className="px-4 mt-4">
        <button
          onClick={() => setShowSheet(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98] transition-transform"
          style={{ background: ORANGE, boxShadow: '0 4px 14px rgba(243,117,32,0.35)' }}
        >
          <span className="text-xl leading-none">+</span> Log a Sale
        </button>
      </div>
      
      {/* PERIOD VIEW */}
      {scope === 'period' && (
        <>
          {/* Totals — iOS grouped list */}
          <SectionHeader>This Period</SectionHeader>
          <Card>
            <SaleSummaryRow label="Furniture" sold={furn} comm={furn * rate.furniture} ratePct={`${(rate.furniture*100).toFixed(1)}%`} />
            <SaleSummaryRow label="Mattress" sold={bed} comm={bed * rate.furniture} ratePct={`${(rate.furniture*100).toFixed(1)}%`} />
            <SaleSummaryRow label="SafeLock / Protection" sold={safe} comm={safe * rate.safelock} ratePct={`${(rate.safelock*100).toFixed(1)}%`} />
            <SaleSummaryRow label="Delivery" sold={del} comm={null} ratePct="—" last />
          </Card>
          <Card mt={2}>
            <div className="px-4 py-3 flex justify-between items-center">
              <div className="text-sm font-bold" style={{ color: DARK }}>Total Earned</div>
              <div className="text-xl font-bold" style={{ color: ORANGE_DARK, fontVariantNumeric: 'tabular-nums' }}>{FMT_MONEY(totalEarned)}</div>
            </div>
          </Card>
          
          {/* Recent sales */}
          {scopedLog.length > 0 && (
            <>
              <SectionHeader>Recent Sales</SectionHeader>
              <Card>
                {[...scopedLog].reverse().slice(0, 30).map((s, i, arr) => (
                  <SaleHistoryRow key={s.id} sale={s} rate={rate} onRemove={() => removeSale(s.id)} last={i === arr.length - 1} />
                ))}
              </Card>
              {scopedLog.length > 30 && <div className="px-5 pt-1.5 text-[11px]" style={{ color: IOS_LABEL_2 }}>+ {scopedLog.length - 30} more counted in totals</div>}
            </>
          )}
          
          {scopedLog.length === 0 && (
            <Card mt={6}>
              <div className="px-4 py-8 text-center">
                <div className="text-sm font-semibold" style={{ color: DARK }}>No sales yet</div>
                <div className="text-xs mt-1" style={{ color: IOS_LABEL_2 }}>Tap "+ Log a Sale" above to start tracking.</div>
              </div>
            </Card>
          )}
          
          {/* Reset — quiet text link */}
          <div className="pt-6 pb-2 text-center">
            {confirmReset === 'period' ? (
              <div className="mx-4 rounded-2xl p-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
                <div className="text-sm font-semibold mb-1" style={{ color: DARK }}>Reset period totals?</div>
                <div className="text-[11px] mb-3" style={{ color: IOS_LABEL_2 }}>Clears commission earned for the period. Quarter totals stay.</div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmReset(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: IOS_BG, color: DARK }}>Cancel</button>
                  <button onClick={() => doReset('period')} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: RED }}>Reset</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmReset('period')} className="text-xs font-semibold" style={{ color: RED }}>Reset Period</button>
            )}
          </div>
        </>
      )}
      
      {/* QUARTER VIEW */}
      {scope === 'quarter' && (
        <QuarterProgress
          totalVolume={totalVolume}
          bedding={bed}
          safelockDollars={safe}
          deliveryDollars={del}
          totalEarned={totalEarned}
          bonus={bonus}
          setBonus={setBonus}
          quarterStart={quarterStart}
          confirmReset={confirmReset}
          setConfirmReset={setConfirmReset}
          doReset={doReset}
        />
      )}
      
      {/* LOG SALE BOTTOM SHEET */}
      {showSheet && <LogSaleSheet onClose={() => setShowSheet(false)} onLog={logSale} />}
    </div>
  );
}

// ============ LOG SALE SHEET ============
function LogSaleSheet({ onClose, onLog }) {
  const [amount, setAmount] = useState('');
  const [type, setType] = useState(null);
  
  const submit = () => {
    const n = parseFloat(amount);
    if (n > 0 && type) onLog(type, n);
  };
  
  const types = [
    { id: 'F', label: 'Furniture', sub: '5%' },
    { id: 'B', label: 'Mattress', sub: '5%' },
    { id: 'S', label: 'SafeLock', sub: '20%' },
    { id: 'D', label: 'Delivery', sub: 'attach' },
  ];
  
  return (
    <div className="absolute inset-0 z-20" style={{ animation: 'none' }}>
      <div className="absolute inset-0" onClick={onClose} style={{ background: 'rgba(0,0,0,0.4)' }} />
      <div className="absolute left-0 right-0 bottom-0 rounded-t-3xl px-5 pt-3 pb-5" style={{ background: IOS_BG }}>
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 rounded-full" style={{ background: IOS_LABEL_3 }} />
        </div>
        <div className="flex items-center justify-between mb-3">
          <button onClick={onClose} className="text-sm font-medium" style={{ color: ORANGE_DARK }}>Cancel</button>
          <div className="text-sm font-bold" style={{ color: DARK }}>Log a Sale</div>
          <button onClick={submit} disabled={!amount || !type || parseFloat(amount) <= 0} className="text-sm font-bold disabled:opacity-30" style={{ color: ORANGE_DARK }}>Save</button>
        </div>
        
        <div className="rounded-2xl px-4 py-5 mb-4" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
          <div className="text-[10px] font-bold tracking-widest text-center" style={{ color: IOS_LABEL_2 }}>SALE AMOUNT</div>
          <div className="flex items-baseline justify-center gap-1 mt-2">
            <div className="text-2xl font-bold" style={{ color: amount ? DARK : IOS_LABEL_3 }}>$</div>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-center focus:outline-none"
              style={{ fontSize: '40px', fontWeight: 800, color: DARK, background: 'transparent', width: '70%', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
        </div>
        
        <div className="text-[10px] font-bold tracking-widest mb-2 px-1" style={{ color: IOS_LABEL_2 }}>CATEGORY</div>
        <div className="grid grid-cols-2 gap-2">
          {types.map(t => {
            const active = type === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className="rounded-2xl py-4 active:scale-[0.97] transition-transform"
                style={{
                  background: active ? ORANGE : '#fff',
                  boxShadow: active ? '0 4px 14px rgba(243,117,32,0.35)' : CARD_SHADOW,
                  color: active ? '#fff' : DARK,
                }}
              >
                <div className="text-base font-bold">{t.label}</div>
                <div className="text-[11px] mt-0.5" style={{ color: active ? 'rgba(255,255,255,0.85)' : IOS_LABEL_2 }}>{t.sub}</div>
              </button>
            );
          })}
        </div>
        
        {type && amount && parseFloat(amount) > 0 && (
          <div className="rounded-2xl px-4 py-3 mt-3 flex justify-between items-baseline" style={{ background: ORANGE_TINT }}>
            <div className="text-xs font-semibold" style={{ color: ORANGE_DARK }}>You'll earn</div>
            <div className="text-lg font-bold" style={{ color: ORANGE_DARK, fontVariantNumeric: 'tabular-nums' }}>
              {type === 'D' ? '— (no comm)' : FMT_MONEY(parseFloat(amount) * (type === 'S' ? 0.20 : 0.05))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ QUARTER PROGRESS ============
function QuarterProgress({ totalVolume, bedding, safelockDollars, deliveryDollars, totalEarned, bonus, setBonus, quarterStart, confirmReset, setConfirmReset, doReset }) {
  const margin = bonus.qMargin || 0;
  const hours = bonus.qHours || 0;
  const restTests = bonus.qRT || 0;
  
  const safelockPct = totalVolume > 0 ? (safelockDollars / totalVolume) * 100 : 0;
  const deliveryPct = totalVolume > 0 ? (deliveryDollars / totalVolume) * 100 : 0;
  
  const marginOK = margin >= MARGIN_MIN;
  const hoursOK = hours >= HOURS_MIN;
  const rtOK = restTests >= RT_MIN;
  const qualifies = marginOK && hoursOK && rtOK;
  
  const tierHit = (val, tiers) => { let h = null; for (const t of tiers) if (val >= t.min) h = t; return h; };
  const nextTier = (val, tiers) => { for (const t of tiers) if (val < t.min) return t; return null; };
  
  const volumeT = tierHit(totalVolume, VOLUME_TIERS);
  const volumeNext = nextTier(totalVolume, VOLUME_TIERS);
  const beddingT = bedding >= 50000 ? tierHit(bedding, BEDDING_TIERS) : null;
  const beddingNext = nextTier(bedding, BEDDING_TIERS);
  const safelockT = safelockDollars >= SAFELOCK_MIN ? tierHit(safelockPct, SAFELOCK_TIERS) : null;
  const safelockNext = nextTier(safelockPct, SAFELOCK_TIERS);
  const deliveryT = deliveryDollars >= DELIVERY_MIN ? tierHit(deliveryPct, DELIVERY_TIERS) : null;
  const deliveryNext = nextTier(deliveryPct, DELIVERY_TIERS);
  
  const volumeBonus = qualifies && volumeT ? volumeT.bonus : 0;
  const beddingBonus = qualifies && beddingT ? beddingT.bonus : 0;
  const safelockBonus = qualifies && safelockT ? safelockT.bonus : 0;
  const deliveryBonus = qualifies && deliveryT ? deliveryT.bonus : 0;
  const totalBonuses = volumeBonus + beddingBonus + safelockBonus + deliveryBonus;
  
  const onPaceForMillion = totalVolume * 4 >= 1000000;
  const midYearOnPace = totalVolume * 2 >= 500000;
  
  return (
    <>
      {/* QUARTER TOTALS */}
      <SectionHeader>This Quarter</SectionHeader>
      <Card>
        <SaleSummaryRow label="Volume Written" sold={totalVolume} comm={null} ratePct={volumeT ? `${volumeT.label} tier` : '—'} />
        <SaleSummaryRow label="Bedding $" sold={bedding} comm={null} ratePct={beddingT ? `${beddingT.label} tier` : (bedding < 50000 ? 'below $50K min' : '—')} />
        <SaleSummaryRow label="SafeLock %" customValue={`${safelockPct.toFixed(2)}%`} comm={null} ratePct={safelockT ? `${safelockT.label} tier` : (safelockDollars < SAFELOCK_MIN ? `$${(SAFELOCK_MIN-safelockDollars).toLocaleString()} below min` : '—')} />
        <SaleSummaryRow label="Delivery %" customValue={`${deliveryPct.toFixed(2)}%`} comm={null} ratePct={deliveryT ? `${deliveryT.label} tier` : (deliveryDollars < DELIVERY_MIN ? `$${(DELIVERY_MIN-deliveryDollars).toLocaleString()} below min` : '—')} last />
      </Card>
      
      {/* COMMISSION + BONUS = TAKE-HOME */}
      <SectionHeader>Quarter Pay</SectionHeader>
      <Card>
        <PayRow label="Commission earned" value={totalEarned} sub="from logged sales" />
        <PayRow label="Quarterly bonuses" value={totalBonuses} sub={qualifies ? '✓ KPIs qualified' : '✗ KPIs not qualified'} subColor={qualifies ? GREEN : RED} />
        <div className="px-4 py-3 flex justify-between items-center" style={{ borderTop: `0.5px solid ${IOS_HAIRLINE}` }}>
          <div className="text-sm font-bold" style={{ color: DARK }}>Total this quarter</div>
          <div className="text-xl font-bold" style={{ color: ORANGE_DARK, fontVariantNumeric: 'tabular-nums' }}>{FMT_MONEY(totalEarned + totalBonuses)}</div>
        </div>
      </Card>
      
      {/* KPI GATES */}
      <SectionHeader>KPI Gates (required for bonuses)</SectionHeader>
      <Card>
        <KPIRow label="Margin" value={margin} unit="%" min={MARGIN_MIN} ok={marginOK} step={1} max={70} onChange={(v) => setBonus({...bonus, qMargin: v})} />
        <KPIRow label="Hours worked" value={hours} unit=" hrs" min={HOURS_MIN} ok={hoursOK} step={20} max={700} onChange={(v) => setBonus({...bonus, qHours: v})} />
        <KPIRow label="Rest Tests" value={restTests} unit="" min={RT_MIN} ok={rtOK} step={1} max={150} onChange={(v) => setBonus({...bonus, qRT: v})} last />
      </Card>
      
      {/* PROXIMITY */}
      {(volumeNext || beddingNext || safelockNext || deliveryNext) && (
        <>
          <SectionHeader>How Much More for Next Tier</SectionHeader>
          <Card>
            {volumeNext && <ProximityRow label={`Volume ${volumeNext.label}`} gap={`+${FMT_MONEY(volumeNext.min - totalVolume)} more`} reward={`+${FMT_MONEY(volumeNext.bonus - (volumeT?.bonus || 0))}`} />}
            {beddingNext && <ProximityRow label={`Bedding ${beddingNext.label}`} gap={`+${FMT_MONEY(beddingNext.min - bedding)} more bedding`} reward={`+${FMT_MONEY(beddingNext.bonus - (beddingT?.bonus || 0))}`} />}
            {safelockNext && totalVolume > 0 && <ProximityRow label={`SafeLock ${safelockNext.label}`} gap={`+${FMT_MONEY(Math.max(SAFELOCK_MIN, Math.ceil((safelockNext.min/100) * totalVolume)) - safelockDollars)} more SafeLock`} reward={`+${FMT_MONEY(safelockNext.bonus - (safelockT?.bonus || 0))}`} />}
            {deliveryNext && totalVolume > 0 && <ProximityRow label={`Delivery ${deliveryNext.label}`} gap={`+${FMT_MONEY(Math.max(DELIVERY_MIN, Math.ceil((deliveryNext.min/100) * totalVolume)) - deliveryDollars)} more delivery`} reward={`+${FMT_MONEY(deliveryNext.bonus - (deliveryT?.bonus || 0))}`} last />}
          </Card>
        </>
      )}
      
      {/* MILLION DOLLAR WRITER */}
      <div className="mx-4 mt-6 rounded-2xl p-4" style={{ background: DARK, boxShadow: CARD_SHADOW }}>
        <div className="flex items-center gap-2 mb-2">
          <Award size={14} style={{ color: ORANGE }} />
          <div className="text-[10px] font-bold tracking-widest" style={{ color: ORANGE }}>MILLION DOLLAR WRITER PACE</div>
        </div>
        <div className="text-xs mb-3" style={{ color: '#F8C99B' }}>Cross $1M for the year — next year's commission rate climbs permanently.</div>
        <div className="space-y-2.5">
          <PaceLine label="This quarter" value={totalVolume} target={250000} />
          <PaceLine label="Annual pace" value={totalVolume * 4} target={1000000} />
          <PaceLine label="Mid-year ($500K by June 30)" value={totalVolume * 2} target={500000} bonus={midYearOnPace ? '+$1,500' : null} />
        </div>
        {onPaceForMillion && (
          <div className="mt-3 rounded-xl p-2.5 text-center" style={{ background: ORANGE }}>
            <div className="text-xs font-bold text-white">🏆 ON PACE — next year's rate +0.5% / +2.5%</div>
          </div>
        )}
      </div>
      
      {/* RESET QUARTER */}
      <div className="pt-6 pb-2 text-center">
        {confirmReset === 'quarter' ? (
          <div className="mx-4 rounded-2xl p-3" style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
            <div className="text-sm font-semibold mb-1" style={{ color: DARK }}>Reset quarter?</div>
            <div className="text-[11px] mb-3" style={{ color: IOS_LABEL_2 }}>Clears bonus tier progress and KPIs. Period totals stay. Use at start of new quarter.</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: IOS_BG, color: DARK }}>Cancel</button>
              <button onClick={() => doReset('quarter')} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: RED }}>Reset</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmReset('quarter')} className="text-xs font-semibold" style={{ color: RED }}>Reset Quarter</button>
        )}
      </div>
    </>
  );
}

// ============ APPLE-STYLE LIST PRIMITIVES ============
function SectionHeader({ children }) {
  return (
    <div className="px-5 pt-6 pb-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: IOS_LABEL_2 }}>{children}</div>
    </div>
  );
}

function Card({ children, mt }) {
  return (
    <div className={`mx-4 rounded-2xl overflow-hidden ${mt ? `mt-${mt}` : ''}`} style={{ background: '#fff', boxShadow: CARD_SHADOW }}>
      {children}
    </div>
  );
}

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SaleSummaryRow({ label, sold, comm, ratePct, customValue, last }) {
  return (
    <div className="px-4 py-3 flex justify-between items-center" style={{ borderBottom: last ? 'none' : `0.5px solid ${IOS_HAIRLINE}` }}>
      <div className="flex-1">
        <div className="text-sm font-semibold" style={{ color: DARK }}>{label}</div>
        <div className="text-[11px] mt-0.5" style={{ color: IOS_LABEL_2 }}>
          {customValue ? customValue : (sold > 0 ? FMT_MONEY(sold) : '—')} · {ratePct}
        </div>
      </div>
      {comm !== null && (
        <div className="text-sm font-bold" style={{ color: comm > 0 ? ORANGE_DARK : IOS_LABEL_3, fontVariantNumeric: 'tabular-nums' }}>{FMT_MONEY(comm)}</div>
      )}
    </div>
  );
}

function SaleHistoryRow({ sale, rate, onRemove, last }) {
  const labels = { F: 'Furniture', B: 'Mattress', S: 'SafeLock', D: 'Delivery' };
  const isComm = sale.type !== 'D';
  const commRate = sale.type === 'S' ? rate.safelock : rate.furniture;
  const commission = isComm ? sale.amount * commRate : 0;
  return (
    <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: last ? 'none' : `0.5px solid ${IOS_HAIRLINE}` }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: ORANGE_TINT }}>
        <div className="text-[10px] font-bold" style={{ color: ORANGE_DARK }}>{labels[sale.type][0]}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: DARK }}>{labels[sale.type]} · {FMT_MONEY(sale.amount)}</div>
        <div className="text-[11px]" style={{ color: IOS_LABEL_2 }}>{fmtTime(sale.ts)}</div>
      </div>
      <div className="text-sm font-bold" style={{ color: isComm ? ORANGE_DARK : IOS_LABEL_3, fontVariantNumeric: 'tabular-nums' }}>
        {isComm ? `+${FMT_MONEY(commission)}` : '—'}
      </div>
      <button onClick={onRemove} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: IOS_BG }}>
        <X size={12} style={{ color: IOS_LABEL_2 }} />
      </button>
    </div>
  );
}

function KPIRow({ label, value, unit, min, ok, step, max, onChange, last }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: last ? 'none' : `0.5px solid ${IOS_HAIRLINE}` }}>
      <div className="flex-1">
        <div className="text-sm font-semibold" style={{ color: DARK }}>{label}</div>
        <div className="text-[11px]" style={{ color: ok ? GREEN : RED, fontWeight: 600 }}>
          {ok ? '✓' : '✗'} need {min}{unit}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(0, value - step))} className="w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center" style={{ background: IOS_BG, color: DARK }}>−</button>
        <div className="w-16 text-center text-sm font-bold" style={{ color: ok ? GREEN : DARK, fontVariantNumeric: 'tabular-nums' }}>{value}{unit}</div>
        <button onClick={() => onChange(Math.min(max, value + step))} className="w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center" style={{ background: IOS_BG, color: DARK }}>+</button>
      </div>
    </div>
  );
}

function PayRow({ label, value, sub, subColor }) {
  return (
    <div className="px-4 py-3 flex justify-between items-center" style={{ borderBottom: `0.5px solid ${IOS_HAIRLINE}` }}>
      <div className="flex-1">
        <div className="text-sm font-semibold" style={{ color: DARK }}>{label}</div>
        {sub && <div className="text-[11px]" style={{ color: subColor || IOS_LABEL_2, fontWeight: subColor ? 600 : 400 }}>{sub}</div>}
      </div>
      <div className="text-base font-bold" style={{ color: DARK, fontVariantNumeric: 'tabular-nums' }}>{FMT_MONEY(value)}</div>
    </div>
  );
}

function ProximityRow({ label, gap, reward, last }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: last ? 'none' : `0.5px solid ${IOS_HAIRLINE}` }}>
      <div className="flex-1">
        <div className="text-sm font-semibold" style={{ color: DARK }}>{label}</div>
        <div className="text-[11px]" style={{ color: IOS_LABEL_2 }}>{gap}</div>
      </div>
      <div className="text-sm font-bold" style={{ color: ORANGE_DARK, fontVariantNumeric: 'tabular-nums' }}>{reward}</div>
    </div>
  );
}

function PaceLine({ label, value, target, bonus }) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const onTrack = value >= target;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-[11px]" style={{ color: '#F8C99B' }}>{label}</div>
        <div className="text-xs font-bold" style={{ color: onTrack ? ORANGE : '#F8C99B', fontVariantNumeric: 'tabular-nums' }}>
          {FMT_MONEY(value)} / {FMT_MONEY(target)} {bonus && onTrack && <span className="ml-1 text-[10px]">{bonus}</span>}
        </div>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(248,201,155,0.2)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: onTrack ? ORANGE : '#F8C99B' }} />
      </div>
    </div>
  );
}
// ============ ME ============
function MeView({ completedDays, quizScores, currentDay, trainerMode, setTrainerMode, resetProgress, setCurrentDay, revealStore, setRevealStore, traineeName, assessment, signatures, hrForms, emergencyContact, pin, setPin, switchUser, profiles, activeProfile, trainerEmail }) {
  const totalProgress = Math.round((completedDays.length / 6) * 100);
  
  return (
    <div className="pb-6">
      <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-xs font-bold tracking-widest" style={{ color: MID }}>SIGNED IN AS</div>
          <div className="text-2xl font-bold mt-1" style={{ color: DARK }}>{traineeName ? traineeName : 'Launch Class'}</div>
          <div className="text-sm mt-1" style={{ color: MID }}>Day {currentDay} of 6 • {completedDays.length} complete</div>
        </div>
        <button onClick={switchUser} className="text-[10px] font-bold px-3 py-2 rounded-full" style={{ background: '#fff', color: ORANGE_DARK, border: `1px solid ${BORDER}` }}>
          Switch User
        </button>
      </div>
      
      <div className="px-6">
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#fff', border: `1px solid ${ORANGE_TINT}` }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold tracking-widest" style={{ color: MID }}>OVERALL</div>
            <div className="text-xs font-bold" style={{ color: ORANGE_DARK }}>{totalProgress}%</div>
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden mb-3" style={{ background: LIGHT_BG }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${totalProgress}%`, background: ORANGE }} />
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {[1,2,3,4,5,6].map(d => {
              const done = completedDays.includes(d);
              const current = d === currentDay && !done;
              return (
                <div key={d} className="text-center">
                  <div className="aspect-square rounded-xl flex items-center justify-center mb-1" style={{ background: done ? ORANGE : (current ? ORANGE_TINT : LIGHT_BG) }}>
                    {done ? <Check size={16} className="text-white" strokeWidth={3} /> : <div className="text-sm font-bold" style={{ color: current ? ORANGE_DARK : MID }}>{d}</div>}
                  </div>
                  <div className="text-[8px] font-medium" style={{ color: MID }}>{['ENGAGE','A&L','S&S','YES','SYS','BED'][d-1]}</div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: MID }}>QUIZ SCORES</div>
        {[1,2,3,4,5,6].map(d => {
          const s = quizScores[d];
          return (
            <div key={d} className="rounded-xl p-3 mb-2 flex items-center justify-between" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div>
                <div className="text-xs font-bold" style={{ color: DARK }}>Day {d} Quiz</div>
                <div className="text-[10px]" style={{ color: MID }}>{quizzes[d].name.replace(`Day ${d}: `, '')}</div>
              </div>
              {s ? (
                <div className="text-right">
                  <div className="text-sm font-bold" style={{ color: s.passed ? GREEN : RED }}>{s.pct}%</div>
                  <div className="text-[10px]" style={{ color: MID }}>{s.score}/{s.total}</div>
                </div>
              ) : <div className="text-[10px]" style={{ color: MID }}>Not taken</div>}
            </div>
          );
        })}
        
        {signatures && (signatures.nonNegotiables || signatures.hygiene || signatures.payBonus) && (
          <>
            <div className="text-[10px] font-bold tracking-widest mt-5 mb-2" style={{ color: MID }}>YOUR SIGNED ACKNOWLEDGMENTS</div>
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <SignedRow label="Non-Negotiables" sig={signatures.nonNegotiables} />
              <SignedRow label="Hygiene & Dress Code" sig={signatures.hygiene} />
              <SignedRow label="Pay & Bonus Plan" sig={signatures.payBonus} last />
            </div>
          </>
        )}
        
        {hrForms && Object.values(hrForms).some(v => v) && (
          <>
            <div className="text-[10px] font-bold tracking-widest mt-5 mb-2" style={{ color: MID }}>HR FORMS</div>
            <div className="rounded-xl p-3" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-[11px]" style={{ color: DARK }}>
                I-9: {hrForms.i9 ? '✓' : '—'} · W-4: {hrForms.w4 ? '✓' : '—'} · Direct Deposit: {hrForms.dd ? '✓' : '—'} · Background: {hrForms.bg ? '✓' : '—'}
              </div>
            </div>
          </>
        )}
        
        {assessment && (
          <>
            <div className="text-[10px] font-bold tracking-widest mt-5 mb-2" style={{ color: MID }}>YOUR PRE-TRAINING ASSESSMENT</div>
            <div className="rounded-xl p-3 mb-2" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
              <div className="text-xs mb-2" style={{ color: DARK }}>You completed your self-rating. Your trainer uses this to coach to where you are.</div>
              {assessment.ratings && Object.keys(assessment.ratings).length > 0 && (
                <div className="text-[10px] mb-1" style={{ color: MID }}>
                  Average self-rating: <span className="font-bold" style={{ color: ORANGE_DARK }}>
                    {(Object.values(assessment.ratings).reduce((a, b) => a + b, 0) / Object.values(assessment.ratings).length).toFixed(1)} / 10
                  </span>
                </div>
              )}
              {assessment.hope && <div className="text-[10px] italic mt-1" style={{ color: MID }}>"{assessment.hope}"</div>}
            </div>
          </>
        )}
        
        <div className="text-[10px] font-bold tracking-widest mt-5 mb-2" style={{ color: MID }}>STORE SETTINGS</div>
        <div className="rounded-xl p-3 mb-2 flex items-center justify-between" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="flex-1 pr-3">
            <div className="text-xs font-bold flex items-center gap-1.5" style={{ color: DARK }}>
              <Eye size={12} style={{ color: ORANGE_DARK }} /> Reveal Store
            </div>
            <div className="text-[10px]" style={{ color: MID }}>If your store has the Reveal scanner, the bedding flow leads with the scan.</div>
          </div>
          <button onClick={() => setRevealStore(!revealStore)} className="w-12 h-7 rounded-full transition-all relative flex-shrink-0" style={{ background: revealStore ? ORANGE : BORDER }}>
            <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all" style={{ left: revealStore ? '22px' : '2px' }} />
          </button>
        </div>
        
        <div className="text-[10px] font-bold tracking-widest mt-4 mb-2" style={{ color: MID }}>TRAINER</div>
        <div className="rounded-xl p-3 mb-2 flex items-center justify-between" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div>
            <div className="text-xs font-bold" style={{ color: DARK }}>Trainer Mode</div>
            <div className="text-[10px]" style={{ color: MID }}>Unlocks all days, drill scoring, sign-offs</div>
          </div>
          <button onClick={() => setTrainerMode(!trainerMode)} className="w-12 h-7 rounded-full transition-all relative" style={{ background: trainerMode ? ORANGE : BORDER }}>
            <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all" style={{ left: trainerMode ? '22px' : '2px' }} />
          </button>
        </div>
        
        {trainerMode && (
          <div className="rounded-xl p-3 mb-2" style={{ background: ORANGE_TINT }}>
            <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: ORANGE_DARK }}>TRAINER • JUMP TO DAY</div>
            <div className="grid grid-cols-6 gap-1.5">
              {[1,2,3,4,5,6].map(d => (
                <button key={d} onClick={() => setCurrentDay(d)} className="aspect-square rounded-lg text-sm font-bold transition-all" style={{ background: currentDay === d ? ORANGE : '#fff', color: currentDay === d ? '#fff' : DARK }}>{d}</button>
              ))}
            </div>
          </div>
        )}
        
        {Object.keys(quizScores).length > 0 && (
          <>
            <div className="text-[10px] font-bold tracking-widest mt-5 mb-2" style={{ color: MID }}>SEND TO TRAINER</div>
            <button
              onClick={() => {
                const today = new Date().toLocaleDateString();
                const allScores = Object.keys(quizScores).map(d => ({ d: parseInt(d), s: quizScores[d] }));
                const avgPct = allScores.length > 0
                  ? Math.round(allScores.reduce((a, x) => a + (x.s?.pct || 0), 0) / allScores.length)
                  : 0;
                
                let body = `PROGRESS REPORT — ${traineeName}\n`;
                body += `Date: ${today}\n`;
                body += `\n=== SUMMARY ===\n`;
                body += `Days completed: ${completedDays.length} of 6\n`;
                body += `Currently on: Day ${currentDay}\n`;
                body += `Quizzes taken: ${allScores.length}\n`;
                body += `Average quiz score: ${avgPct}%\n`;
                
                body += `\n=== QUIZ SCORES BY DAY ===\n`;
                for (let d = 1; d <= 6; d++) {
                  const s = quizScores[d];
                  if (s) body += `Day ${d}: ${s.score}/${s.total} = ${s.pct}% — ${s.passed ? 'PASSED' : 'NOT PASSED'}\n`;
                  else body += `Day ${d}: not taken\n`;
                }
                
                body += `\n=== SIGNATURES ===\n`;
                body += `Non-Negotiables: ${signatures?.nonNegotiables ? 'Signed by ' + signatures.nonNegotiables.fullName + ' on ' + signatures.nonNegotiables.date : 'NOT SIGNED'}\n`;
                body += `Hygiene & Dress Code: ${signatures?.hygiene ? 'Signed by ' + signatures.hygiene.fullName + ' on ' + signatures.hygiene.date : 'NOT SIGNED'}\n`;
                body += `Pay & Bonus Plan: ${signatures?.payBonus ? 'Signed by ' + signatures.payBonus.fullName + ' on ' + signatures.payBonus.date : 'NOT SIGNED'}\n`;
                
                body += `\n=== HR FORMS ===\n`;
                body += `I-9: ${hrForms?.i9 ? '✓' : 'pending'}\n`;
                body += `W-4: ${hrForms?.w4 ? '✓' : 'pending'}\n`;
                body += `Direct Deposit: ${hrForms?.dd ? '✓' : 'pending'}\n`;
                body += `Background: ${hrForms?.bg ? '✓' : 'pending'}\n`;
                
                if (assessment) {
                  const ratingsArr = Object.values(assessment.ratings || {});
                  const ratingAvg = ratingsArr.length > 0 ? (ratingsArr.reduce((a,b) => a+b, 0) / ratingsArr.length).toFixed(1) : 'N/A';
                  body += `\n=== PRE-TRAINING ASSESSMENT ===\n`;
                  body += `Self-rating average: ${ratingAvg} / 10\n`;
                  if (assessment.hope) body += `Hope: "${assessment.hope}"\n`;
                }
                
                body += `\n---\nSent from The Launch app`;
                
                const subject = encodeURIComponent(`Progress Report — ${traineeName} — Day ${currentDay}`);
                window.open(`mailto:${trainerEmail}?subject=${subject}&body=${encodeURIComponent(body)}`, '_blank');
              }}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: ORANGE }}
            >
              📧 Email Progress Report to Trainer
            </button>
            <div className="text-[10px] mt-1 text-center" style={{ color: MID }}>Sent to {trainerEmail}</div>
          </>
        )}
        
        <button onClick={resetProgress} className="w-full mt-4 py-2.5 rounded-xl text-xs font-medium" style={{ background: '#fff', color: RED, border: `1px solid ${BORDER}` }}>
          Reset This Profile&rsquo;s Progress
        </button>
        
        {trainerMode && (
          <button
            onClick={() => {
              if (confirm('WIPE ALL PROFILES on this device? This deletes EVERY trainee\'s data — name, progress, signatures, pay log, the whole thing. The app returns to a fresh state. Use this only for testing or device handoff.')) {
                (async () => {
                  for (const p of profiles) {
                    try { await _storage.delete(`launch:profile:${p.id}`); } catch {}
                  }
                  try { await _storage.delete('launch:profiles_index'); } catch {}
                  try { await _storage.delete('launch:active_profile'); } catch {}
                  try { await _storage.delete('launch:state'); } catch {} // legacy
                  window.location.reload();
                })();
              }
            }}
            className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: RED, color: '#fff' }}
          >
            ⚠ WIPE ALL PROFILES (Trainer)
          </button>
        )}
      </div>
    </div>
  );
}

function SignedRow({ label, sig, last }) {
  return (
    <div className="px-3 py-2.5 flex justify-between items-start" style={{ borderBottom: last ? 'none' : `0.5px solid ${BORDER}` }}>
      <div className="flex-1">
        <div className="text-xs font-bold" style={{ color: DARK }}>{label}</div>
        {sig ? (
          <div className="text-[10px] mt-0.5" style={{ color: MID }}>
            <span className="italic">{sig.fullName}</span> · {sig.date}
          </div>
        ) : (
          <div className="text-[10px] mt-0.5" style={{ color: RED }}>Not signed</div>
        )}
      </div>
      {sig && <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: GREEN }} strokeWidth={3} />}
    </div>
  );
}

// ============ BOTTOM NAV ============
function BottomNav({ tab, setTab }) {
  const items = [
    { id: 'today', icon: Home, label: 'Today' },
    { id: 'learn', icon: BookOpen, label: 'Learn' },
    { id: 'quiz', icon: ClipboardCheck, label: 'Quiz' },
    { id: 'pay', icon: DollarSign, label: 'Pay' },
    { id: 'me', icon: User, label: 'Me' },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t" style={{ borderColor: BORDER }}>
      <div className="flex items-center justify-around py-2">
        {items.map(item => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button key={item.id} onClick={() => setTab(item.id)} className="flex flex-col items-center gap-0.5 py-1.5 px-2 transition-all">
              <Icon size={20} style={{ color: active ? ORANGE : MID }} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-semibold" style={{ color: active ? ORANGE : MID }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
