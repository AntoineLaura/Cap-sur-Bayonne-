const C = window.CAP_CONFIG || {};
const configured = C.key && !C.key.includes('COLLE_ICI');
const db = configured ? supabase.createClient(C.url, C.key) : null;

const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const today = () => new Date().toISOString().slice(0, 10);
const ym = (date) => date.slice(0, 7);
const dateObj = (date) => new Date(`${date}T12:00:00`);

const monday = (date) => {
  const value = dateObj(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return value.toISOString().slice(0, 10);
};

const monthsLeft = (start, end) => {
  const first = dateObj(start);
  const last = dateObj(end);
  return Math.max(
    1,
    (last.getFullYear() - first.getFullYear()) * 12 +
      last.getMonth() -
      first.getMonth()
  );
};

const D = {
  scenario: 'prudent',
  loaStrategy: 'buyout',
  housePrice: 350000,
  feesRate: 7.5,
  guarantee: 3500,
  tMin: 40000,
  tComfort: 50000,
  tSerenity: 60000,
  targetDate: '2028-11-30',
  antoineCash: 2650.92,
  antoineBank: 3600,
  tickets: 96,
  lauraCash: 1650,
  lauraBank: 1710,
  rent: 1240,
  aptLoan: 780,
  rentIncome: 790,
  taxAnnual: 670,
  condoQuarter: 460,
  phones: 24,
  internet: 22,
  gym: 100,
  carInsurance: 20,
  fuel: 0,
  otherFixed: 0,
  loaPrice: 28000,
  loaMonthly: 300,
  loaBuyout: 20000,
  loaStart: '2026-11-01',
  loaBuyoutDate: '2028-11-30',
  lauraSavings: 2000,
  lauraCarPrudent: 6000,
  lauraCarProbable: 6500,
  lauraCarOptimistic: 7000,
  salePrudent: 180000,
  saleProbable: 193000,
  saleOptimistic: 200000,
  netSalePrudent: 28597,
  netSaleProbable: 41597,
  netSaleOptimistic: 48597,
  mortgageRate: 4,
  mortgageYears: 25,
  loanInsurance: 0.3,
  debtRatio: 35,
};

const STEPS = [
  ['Début LOA JAECOO 5', '2026-11-01'],
  ['Versement PEE 2025/2026', '2026-12-31'],
  ['Prime objectifs 2026/2027', '2027-08-31'],
  ['Versement PEE 2026/2027', '2027-12-31'],
  ['Rendez-vous banque / courtier', '2028-03-31'],
  ['Mise en vente appartement', '2028-04-01'],
  ['Dépôt dossier de prêt', '2028-05-31'],
  ['Recherche / compromis', '2028-07-31'],
  ['Vente appartement', '2028-11-30'],
  ['Rachat ou maintien LOA', '2028-11-30'],
  ['Achat maison', '2028-11-30'],
];

const CATS = [
  'Courses',
  'Restaurant',
  'Bars / sorties',
  'Vacances',
  'Transport',
  'Maison',
  'Santé',
  'Sport',
  'Abonnements',
  'Cadeaux',
  'Divers',
];

let user = null;
let tab = 'home';
let entries = [];
let flows = [];
let settings = { ...D };
let scenario = 'prudent';

const configs = () => flows.filter((item) => item.direction === 'config');
const moneyFlows = () =>
  flows.filter((item) => ['in', 'out'].includes(item.direction));
const steps = () =>
  flows
    .filter((item) => item.direction === 'milestone')
    .sort((a, b) => Number(a.amount) - Number(b.amount));

function noteData(entry) {
  try {
    const parsed = JSON.parse(entry.note || '{}');
    return typeof parsed === 'object'
      ? parsed
      : { comment: entry.note || '', category: 'Divers' };
  } catch {
    return { comment: entry.note || '', category: 'Divers' };
  }
}

function decode() {
  settings = { ...D };

  for (const item of configs()) {
    let value = item.status;
    if (value !== '' && !Number.isNaN(Number(value))) {
      value = Number(value);
    }
    settings[item.label] = value;
  }

  scenario =
    localStorage.getItem('bayonne-scenario') ||
    settings.scenario ||
    'prudent';
}

function cap(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function netSale() {
  return Number(settings[`netSale${cap(scenario)}`]);
}

function lauraCar() {
  return Number(settings[`lauraCar${cap(scenario)}`]);
}

function capacity(payment, rate, years, insurance) {
  const periods = years * 12;
  const monthlyRate = rate / 1200;
  const monthlyInsurance = insurance / 1200;

  if (payment <= 0) return 0;

  if (monthlyRate === 0) {
    return payment / (1 / periods + monthlyInsurance);
  }

  return (
    payment /
    (monthlyRate / (1 - Math.pow(1 + monthlyRate, -periods)) +
      monthlyInsurance)
  );
}

function monthWeeks(month) {
  const first = dateObj(`${month}-01`);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
  const values = new Set();

  for (let date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    values.add(monday(date.toISOString().slice(0, 10)));
  }

  return [...values].sort();
}

function calc() {
  const savings =
    entries
      .filter((item) => ['Mise de côté', 'Entrée réelle'].includes(item.type))
      .reduce((sum, item) => sum + Number(item.amount), 0) -
    entries
      .filter((item) => item.type === 'Retrait épargne')
      .reduce((sum, item) => sum + Number(item.amount), 0);

  const projectedInflows = moneyFlows()
    .filter((item) => item.direction === 'in' && item.status !== 'Réalisé')
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const projectedOutflows = moneyFlows()
    .filter((item) => item.direction === 'out' && item.status !== 'Réalisé')
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const loaBuyout =
    settings.loaStrategy === 'buyout' ? Number(settings.loaBuyout) : 0;

  const contribution =
    savings +
    projectedInflows -
    projectedOutflows +
    Number(settings.lauraSavings) +
    lauraCar() +
    netSale() -
    loaBuyout;

  const gaps = {
    min: Math.max(0, Number(settings.tMin) - contribution),
    comfort: Math.max(0, Number(settings.tComfort) - contribution),
    serenity: Math.max(0, Number(settings.tSerenity) - contribution),
  };

  const bankIncome =
    Number(settings.antoineBank) + Number(settings.lauraBank);

  const maximumDebtPayment =
    (bankIncome * Number(settings.debtRatio)) / 100;

  const immoPayment = Math.max(
    0,
    maximumDebtPayment -
      (settings.loaStrategy === 'keep' ? Number(settings.loaMonthly) : 0)
  );

  const borrow = capacity(
    immoPayment,
    Number(settings.mortgageRate),
    Number(settings.mortgageYears),
    Number(settings.loanInsurance)
  );

  const projectCost =
    Number(settings.housePrice) * (1 + Number(settings.feesRate) / 100) +
    Number(settings.guarantee);

  // CORRECTION PRINCIPALE
  // Le besoin d'épargne correspond au vrai déficit de financement.
  const fundingGap = Math.max(0, projectCost - borrow - contribution);

  const remainingMonths = monthsLeft(today(), settings.targetDate);
  const monthlySaving = fundingGap / remainingMonths;
  const weeklySaving = (monthlySaving * 12) / 52;

  const cashIncome =
    Number(settings.antoineCash) + Number(settings.lauraCash);

  const fixed =
    Number(settings.rent) +
    Number(settings.aptLoan) -
    Number(settings.rentIncome) +
    Number(settings.taxAnnual) / 12 +
    Number(settings.condoQuarter) / 3 +
    Number(settings.phones) +
    Number(settings.internet) +
    Number(settings.gym) +
    Number(settings.carInsurance) +
    Number(settings.fuel) +
    Number(settings.otherFixed) +
    Number(settings.loaMonthly);

  const monthlyVariable = Math.max(0, cashIncome - fixed - monthlySaving);
  const baseWeekly = (monthlyVariable * 12) / 52;
  const currentMonth = ym(today());
  const weeks = monthWeeks(currentMonth);
  const currentWeek = monday(today());
  let carry = 0;
  const weekInfo = [];

  // CORRECTION REPORT HEBDOMADAIRE
  // Le solde d'une semaine passée est reporté sur la semaine suivante.
  // Les semaines futures restent au budget normal tant qu'elles ne sont pas atteintes.
  for (const week of weeks) {
    const spent = entries
      .filter(
        (item) =>
          item.type === 'Dépense' &&
          ym(item.date) === currentMonth &&
          monday(item.date) === week
      )
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const isPast = week < currentWeek;
    const isCurrent = week === currentWeek;

    const available =
      isPast || isCurrent ? Math.max(0, baseWeekly + carry) : baseWeekly;

    const remaining = available - spent;

    weekInfo.push({
      week,
      available,
      spent,
      remaining,
      status: isPast ? 'Clôturée' : isCurrent ? 'En cours' : 'À venir',
    });

    if (isPast) {
      carry = remaining;
    }
  }

  const current = weekInfo.find((item) => item.week === currentWeek) || {
    available: baseWeekly,
    spent: 0,
    remaining: baseWeekly,
  };

  return {
    savings,
    projectedInflows,
    projectedOutflows,
    loaBuyout,
    contribution,
    gaps,
    remainingMonths,
    fundingGap,
    monthlySaving,
    weeklySaving,
    cashIncome,
    fixed,
    monthlyVariable,
    baseWeekly,
    current,
    weekInfo,
    bankIncome,
    immoPayment,
    borrow,
    projectCost,
  };
}

async function initializeStructuralRows() {
  if (!configs().length) {
    const rows = Object.entries(D).map(([key, value]) => ({
      label: key,
      amount: 0,
      date: '2026-01-01',
      status: String(value),
      direction: 'config',
    }));

    const result = await db.from('flows').insert(rows);
    if (result.error) throw result.error;
    flows.push(...rows);
  }

  if (!steps().length) {
    const rows = STEPS.map((item, index) => ({
      label: item[0],
      amount: index + 1,
      date: item[1],
      status: 'À planifier',
      direction: 'milestone',
    }));

    const result = await db.from('flows').insert(rows);
    if (result.error) throw result.error;
    flows.push(...rows);
  }
}

async function load() {
  const [entryResult, flowResult] = await Promise.all([
    db.from('entries').select('*').order('id', { ascending: false }),
    db.from('flows').select('*').order('id'),
  ]);

  if (entryResult.error) throw entryResult.error;
  if (flowResult.error) throw flowResult.error;

  entries = entryResult.data || [];
  flows = flowResult.data || [];

  // Ne recrée plus automatiquement les primes supprimées.
  await initializeStructuralRows();
  decode();
  render();
}

async function boot() {
  if (!configured) return render();

  user = (await db.auth.getSession()).data.session?.user || null;
  if (!user) return render();

  await load();

  db.channel('super-v3-corrected')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'entries' },
      load
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'flows' },
      load
    )
    .subscribe();
}

const TABS = [
  ['home', 'Accueil'],
  ['add', 'Ajouter'],
  ['analysis', 'Analyse'],
  ['flows', 'Hypothèses'],
  ['scenarios', 'Scénarios'],
  ['calendar', 'Calendrier'],
  ['history', 'Historique'],
  ['settings', 'Réglages'],
];

function nav() {
  return user
    ? TABS.map(
        ([key, label]) =>
          `<button class="nav ${tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`
      ).join('')
    : '';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[character]
  );
}

function login() {
  return `
    <div class="card" style="max-width:520px;margin:40px auto">
      <h2>Connexion</h2>
      <p class="muted">Saisis une adresse autorisée.</p>
      <form id="login">
        <input class="full" name="email" type="email" required>
        <button class="btn green full">Recevoir le lien</button>
      </form>
      <div id="msg" class="notice" style="display:none;margin-top:12px"></div>
    </div>`;
}

function scenarioButtons() {
  return `
    <div class="tabs">
      ${[
        ['prudent', 'Prudent'],
        ['probable', 'Probable'],
        ['optimistic', 'Optimiste'],
      ]
        .map(
          ([key, label]) =>
            `<button class="tab ${scenario === key ? 'active' : ''}" data-scenario="${key}">${label}</button>`
        )
        .join('')}
    </div>`;
}

function metric(label, value, subtitle, className = '') {
  return `
    <div class="card">
      <div class="label">${label}</div>
      <div class="metric ${className}">${euro.format(value)}</div>
      <div class="muted">${subtitle}</div>
    </div>`;
}

function home() {
  const values = calc();

  return `
    <div class="stack">
      ${scenarioButtons()}

      <div class="hero">
        <div class="row">
          <div>
            <div class="label">Contribution nette projetée</div>
            <div class="big">${euro.format(values.contribution)}</div>
            <div class="label">Scénario ${scenario} · LOA ${settings.loaStrategy === 'buyout' ? 'rachetée' : 'conservée'}</div>
          </div>
          <div>
            <div class="label">Reste à financer</div>
            <div class="metric">${euro.format(values.fundingGap)}</div>
          </div>
        </div>
        <div class="progress">
          <div style="width:${Math.min(
            100,
            ((values.borrow + values.contribution) / values.projectCost) * 100
          )}%"></div>
        </div>
      </div>

      <div class="badges">
        <span class="badge ${values.gaps.min ? 'no' : 'ok'}">${
    values.gaps.min ? '✕' : '✓'
  } Minimum ${euro.format(settings.tMin)}</span>
        <span class="badge ${values.gaps.comfort ? 'no' : 'ok'}">${
    values.gaps.comfort ? '✕' : '✓'
  } Confort ${euro.format(settings.tComfort)}</span>
        <span class="badge ${values.gaps.serenity ? 'no' : 'ok'}">${
    values.gaps.serenity ? '✕' : '✓'
  } Sérénité ${euro.format(settings.tSerenity)}</span>
      </div>

      <div class="grid g4">
        ${metric(
          'Épargne à viser / mois',
          values.monthlySaving,
          'Calculée sur le reste réel à financer',
          'greenText'
        )}
        ${metric(
          'Épargne à viser / semaine',
          values.weeklySaving,
          'Calculée sur le reste réel à financer'
        )}
        ${metric(
          'Budget disponible cette semaine',
          values.current.available,
          'Report des semaines clôturées inclus',
          'blueText'
        )}
        ${metric(
          'Reste cette semaine',
          values.current.remaining,
          'Remis à zéro le mois suivant',
          values.current.remaining < 0 ? 'redText' : 'greenText'
        )}
      </div>

      <div class="grid g2">
        <div class="card">
          <h2>Budget mensuel</h2>
          <div class="details">
            <div><span>Revenus encaissés</span><b>${euro.format(
              values.cashIncome
            )}</b></div>
            <div><span>Charges fixes</span><b>− ${euro.format(
              values.fixed
            )}</b></div>
            <div><span>Épargne Bayonne</span><b>− ${euro.format(
              values.monthlySaving
            )}</b></div>
            <div class="divider"><span>Budget variable du mois</span><b>${euro.format(
              values.monthlyVariable
            )}</b></div>
          </div>
        </div>

        <div class="card">
          <h2>Financement immobilier indicatif</h2>
          <div class="details">
            <div><span>Capacité d’emprunt</span><b>${euro.format(
              values.borrow
            )}</b></div>
            <div><span>Contribution nette</span><b>${euro.format(
              values.contribution
            )}</b></div>
            <div><span>Coût total du projet</span><b>${euro.format(
              values.projectCost
            )}</b></div>
            <div class="divider"><span>Reste à financer</span><b class="${
              values.fundingGap > 0 ? 'redText' : 'greenText'
            }">${euro.format(values.fundingGap)}</b></div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Semaines du mois</h2>
        ${values.weekInfo
          .map(
            (week, index) => `
              <div class="item">
                <b>Semaine ${index + 1} · ${week.week}</b>
                <span class="muted">${week.status}</span>
                <span>
                  Budget ${euro.format(week.available)} ·
                  dépensé ${euro.format(week.spent)} ·
                  <b class="${week.remaining < 0 ? 'redText' : 'greenText'}">
                    reste ${euro.format(week.remaining)}
                  </b>
                </span>
              </div>`
          )
          .join('')}
      </div>
    </div>`;
}

function add() {
  return `
    <div class="grid g2">
      <div class="card">
        <h2>Ajouter une dépense</h2>
        <form id="expenseForm">
          <label>Personne
            <select name="person">
              <option>Antoine</option>
              <option>Laura</option>
              <option>Commun</option>
            </select>
          </label>
          <label>Catégorie
            <select name="category">
              ${CATS.map((category) => `<option>${category}</option>`).join('')}
            </select>
          </label>
          <label>Montant<input name="amount" type="number" step=".01" required></label>
          <label>Date<input name="date" type="date" value="${today()}" required></label>
          <label class="full">Commentaire<input name="comment"></label>
          <button class="btn violet full">Enregistrer la dépense</button>
        </form>
      </div>

      <div class="card">
        <h2>Argent mis de côté</h2>
        <p class="muted" style="margin-bottom:12px">
          Enregistre un versement hebdomadaire, mensuel ou exceptionnel.
        </p>
        <form id="savingForm">
          <label>Personne
            <select name="person">
              <option>Antoine</option>
              <option>Laura</option>
              <option>Commun</option>
            </select>
          </label>
          <label>Support
            <select name="category">
              <option>Livret A</option>
              <option>PEE</option>
              <option>Autre épargne</option>
            </select>
          </label>
          <label>Montant<input name="amount" type="number" step=".01" required></label>
          <label>Date<input name="date" type="date" value="${today()}" required></label>
          <label class="full">Commentaire<input name="comment"></label>
          <button class="btn green full">Ajouter l’épargne réelle</button>
        </form>
      </div>
    </div>`;
}

function analysis() {
  const month = localStorage.getItem('analysis-month') || ym(today());
  const rows = entries.filter(
    (entry) => entry.type === 'Dépense' && ym(entry.date) === month
  );
  const byCategory = {};
  const byPerson = {};

  for (const entry of rows) {
    const note = noteData(entry);
    const category = note.category || 'Divers';
    byCategory[category] = (byCategory[category] || 0) + Number(entry.amount);
    byPerson[entry.person] =
      (byPerson[entry.person] || 0) + Number(entry.amount);
  }

  const maximum = Math.max(1, ...Object.values(byCategory));
  const total = rows.reduce((sum, entry) => sum + Number(entry.amount), 0);

  return `
    <div class="stack">
      <div class="card">
        <div class="row">
          <h2>Analyse mensuelle</h2>
          <input id="analysisMonth" type="month" value="${month}" style="max-width:190px">
        </div>
      </div>
      <div class="grid g2">
        <div class="card">
          <h2>Dépenses par catégorie</h2>
          ${
            Object.keys(byCategory).length
              ? Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(
                    ([category, amount]) => `
                      <div class="chart-row">
                        <span>${category}</span>
                        <div class="bar"><div style="width:${
                          (amount / maximum) * 100
                        }%"></div></div>
                        <b>${euro.format(amount)}</b>
                      </div>`
                  )
                  .join('')
              : 'Aucune dépense ce mois.'
          }
          <div class="divider details">
            <div><span>Total</span><b>${euro.format(total)}</b></div>
          </div>
        </div>
        <div class="card">
          <h2>Répartition par personne</h2>
          ${
            Object.entries(byPerson)
              .map(
                ([person, amount]) => `
                  <div class="item">
                    <span>${person}</span>
                    <b>${euro.format(amount)}</b>
                  </div>`
              )
              .join('') || 'Aucune dépense ce mois.'
          }
        </div>
      </div>
    </div>`;
}

function flowsView() {
  return `
    <div class="card">
      <h2>Ajouter une hypothèse</h2>
      <form id="flowForm">
        <label>Libellé<input name="label" required></label>
        <label>Montant<input name="amount" type="number" required></label>
        <label>Date<input name="date" type="date" value="${today()}" required></label>
        <label>Sens
          <select name="direction">
            <option value="in">Entrée</option>
            <option value="out">Sortie</option>
          </select>
        </label>
        <button class="btn violet full">Ajouter</button>
      </form>
    </div>
    <div class="card">
      ${moneyFlows()
        .map(
          (item) => `
            <div class="item">
              <div>
                <b>${esc(item.label)}</b>
                <div class="muted">${item.date} · ${item.status}</div>
              </div>
              <b>${item.direction === 'in' ? '+' : '−'}${euro.format(
            item.amount
          )}</b>
              <div class="actions">
                <button class="btn soft" data-edit-flow="${item.id}">Modifier</button>
                ${
                  item.status !== 'Réalisé'
                    ? `<button class="btn green" data-realize="${item.id}">Réalisé</button>`
                    : ''
                }
                <button class="btn red" data-delete-flow="${item.id}">Supprimer</button>
              </div>
            </div>`
        )
        .join('')}
    </div>`;
}

function scenarios() {
  const originalScenario = scenario;
  const cards = ['prudent', 'probable', 'optimistic'].map((value) => {
    scenario = value;
    const result = calc();
    return `
      <div class="card">
        <h3>${value === 'optimistic' ? 'Optimiste' : cap(value)}</h3>
        <div class="details">
          <div><span>Vente appartement</span><b>${euro.format(
            settings[`sale${cap(value)}`]
          )}</b></div>
          <div><span>Produit net</span><b>${euro.format(netSale())}</b></div>
          <div><span>Voiture Laura</span><b>${euro.format(
            lauraCar()
          )}</b></div>
          <div><span>Contribution</span><b>${euro.format(
            result.contribution
          )}</b></div>
          <div><span>Reste à financer</span><b>${euro.format(
            result.fundingGap
          )}</b></div>
          <div><span>Épargne / semaine</span><b>${euro.format(
            result.weeklySaving
          )}</b></div>
        </div>
      </div>`;
  });
  scenario = originalScenario;

  return `
    <div class="stack">
      <div class="card">
        <h2>Scénarios appartement</h2>
        <div class="grid g3">${cards.join('')}</div>
      </div>
      <div class="card">
        <h2>Arbitrage LOA</h2>
        <div class="grid g2">
          <div>
            <h3>Racheter</h3>
            <p class="muted">Réduit l’apport de ${euro.format(
              settings.loaBuyout
            )}, mais supprime la mensualité avant le prêt.</p>
          </div>
          <div>
            <h3>Conserver</h3>
            <p class="muted">Préserve la trésorerie mais réduit la mensualité immobilière disponible de ${euro.format(
              settings.loaMonthly
            )}.</p>
          </div>
        </div>
      </div>
    </div>`;
}

function calendar() {
  return `
    <div class="card">
      <h2>Calendrier partagé</h2>
      ${steps()
        .map(
          (item) => `
            <div class="calendar">
              <input value="${esc(item.label)}" data-mlabel="${item.id}">
              <input type="date" value="${item.date}" data-mdate="${item.id}">
              <select data-mstatus="${item.id}">
                ${['À planifier', 'En attente', 'En cours', 'Réalisé', 'À venir']
                  .map(
                    (status) =>
                      `<option ${status === item.status ? 'selected' : ''}>${status}</option>`
                  )
                  .join('')}
              </select>
            </div>`
        )
        .join('')}
      <button id="addStep" class="btn soft" style="margin-top:12px">Ajouter une étape</button>
    </div>`;
}

function history() {
  return `
    <div class="card">
      <h2>Historique partagé</h2>
      ${
        entries.length
          ? entries
              .map((entry) => {
                const note = noteData(entry);
                return `
                  <div class="item">
                    <div>
                      <b>${esc(note.comment || entry.type)}</b>
                      <div class="muted">${entry.person} · ${entry.date} · ${entry.type} · ${esc(
                  note.category || 'Divers'
                )}</div>
                    </div>
                    <b>${euro.format(entry.amount)}</b>
                    <button class="btn red" data-delete-entry="${entry.id}">Supprimer</button>
                  </div>`;
              })
              .join('')
          : 'Aucune opération'
      }
    </div>`;
}

const GROUPS = [
  [
    'Revenus',
    [
      ['antoineCash', 'Net Antoine versé'],
      ['antoineBank', 'Net Antoine banque'],
      ['tickets', 'Tickets restaurant'],
      ['lauraCash', 'Net Laura versé'],
      ['lauraBank', 'Net Laura banque'],
    ],
  ],
  [
    'Charges',
    [
      ['rent', 'Loyer'],
      ['aptLoan', 'Crédit appartement'],
      ['rentIncome', 'Loyer encaissé'],
      ['taxAnnual', 'Taxe foncière annuelle'],
      ['condoQuarter', 'Copro trimestrielle'],
      ['phones', 'Téléphones'],
      ['internet', 'Internet'],
      ['gym', 'Sport'],
      ['carInsurance', 'Assurance voiture'],
      ['fuel', 'Carburant'],
      ['otherFixed', 'Autres charges'],
    ],
  ],
  [
    'LOA',
    [
      ['loaPrice', 'Prix voiture'],
      ['loaMonthly', 'Mensualité'],
      ['loaBuyout', 'Valeur de rachat'],
      ['loaStart', 'Début', 'date'],
      ['loaBuyoutDate', 'Date de rachat', 'date'],
    ],
  ],
  [
    'Immobilier',
    [
      ['housePrice', 'Prix maison'],
      ['feesRate', 'Frais acquisition (%)'],
      ['guarantee', 'Garantie / dossier'],
      ['mortgageRate', 'Taux prêt (%)'],
      ['mortgageYears', 'Durée (ans)'],
      ['loanInsurance', 'Assurance prêt (%)'],
      ['debtRatio', 'Taux effort (%)'],
      ['targetDate', 'Date cible', 'date'],
    ],
  ],
  [
    'Cibles',
    [
      ['tMin', 'Minimum'],
      ['tComfort', 'Confort'],
      ['tSerenity', 'Sérénité'],
    ],
  ],
  [
    'Appartement',
    [
      ['salePrudent', 'Vente prudente'],
      ['netSalePrudent', 'Net prudent'],
      ['saleProbable', 'Vente probable'],
      ['netSaleProbable', 'Net probable'],
      ['saleOptimistic', 'Vente optimiste'],
      ['netSaleOptimistic', 'Net optimiste'],
    ],
  ],
  [
    'Laura',
    [
      ['lauraSavings', 'Épargne'],
      ['lauraCarPrudent', 'Voiture basse'],
      ['lauraCarProbable', 'Voiture probable'],
      ['lauraCarOptimistic', 'Voiture haute'],
    ],
  ],
];

function settingsView() {
  return `
    <div class="stack">
      <div class="card">
        <h2>Stratégie LOA</h2>
        <form id="strategy">
          <label>Choix
            <select name="loaStrategy">
              <option value="buyout" ${
                settings.loaStrategy === 'buyout' ? 'selected' : ''
              }>Racheter</option>
              <option value="keep" ${
                settings.loaStrategy === 'keep' ? 'selected' : ''
              }>Conserver</option>
            </select>
          </label>
          <button class="btn green">Enregistrer</button>
        </form>
      </div>
      ${GROUPS.map(
        ([title, fields]) => `
          <div class="card">
            <h2>${title}</h2>
            <form class="settingsForm cols3">
              ${fields
                .map(
                  ([key, label, type]) => `
                    <label>${label}
                      <input
                        name="${key}"
                        type="${type || 'number'}"
                        step="${type ? '' : '0.01'}"
                        value="${settings[key]}"
                      >
                    </label>`
                )
                .join('')}
              <button class="btn green">Enregistrer ce bloc</button>
            </form>
          </div>`
      ).join('')}
      <div class="card">
        <button id="logout" class="btn red">Se déconnecter</button>
      </div>
    </div>`;
}

function render() {
  document.querySelector('#nav').innerHTML = nav();
  document.querySelector('#app').innerHTML = !configured
    ? `<div class="notice">La clé Supabase manque dans config.js.</div>`
    : !user
      ? login()
      : {
          home,
          add,
          analysis,
          flows: flowsView,
          scenarios,
          calendar,
          history,
          settings: settingsView,
        }[tab]();

  bind();
}

async function saveSetting(key, value) {
  const existing = configs().find((item) => item.label === key);
  const payload = {
    label: key,
    amount: 0,
    date: '2026-01-01',
    status: String(value),
    direction: 'config',
  };

  return existing
    ? db.from('flows').update(payload).eq('id', existing.id)
    : db.from('flows').insert(payload);
}

function entryPayload(formData, type) {
  return {
    person: formData.get('person'),
    type,
    amount: Number(formData.get('amount')),
    date: formData.get('date'),
    note: JSON.stringify({
      category: formData.get('category'),
      comment: formData.get('comment') || '',
    }),
  };
}

function bind() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.onclick = () => {
      tab = button.dataset.tab;
      render();
    };
  });

  document.querySelectorAll('[data-scenario]').forEach((button) => {
    button.onclick = () => {
      scenario = button.dataset.scenario;
      localStorage.setItem('bayonne-scenario', scenario);
      render();
    };
  });

  const loginForm = document.querySelector('#login');
  if (loginForm) {
    loginForm.onsubmit = async (event) => {
      event.preventDefault();
      const email = new FormData(loginForm).get('email');
      const message = document.querySelector('#msg');
      const { error } = await db.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin },
      });
      message.style.display = 'block';
      message.textContent = error ? error.message : 'Lien envoyé.';
    };
  }

  for (const [id, type] of [
    ['expenseForm', 'Dépense'],
    ['savingForm', 'Mise de côté'],
  ]) {
    const form = document.querySelector(`#${id}`);
    if (form) {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const result = await db
          .from('entries')
          .insert(entryPayload(new FormData(form), type));

        if (result.error) alert(result.error.message);
        else {
          tab = 'home';
          load();
        }
      };
    }
  }

  const flowForm = document.querySelector('#flowForm');
  if (flowForm) {
    flowForm.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(flowForm);
      const result = await db.from('flows').insert({
        label: data.get('label'),
        amount: Number(data.get('amount')),
        date: data.get('date'),
        status: 'Prévu',
        direction: data.get('direction'),
      });

      if (result.error) alert(result.error.message);
      else load();
    };
  }

  document.querySelectorAll('[data-realize]').forEach((button) => {
    button.onclick = async () => {
      const item = moneyFlows().find(
        (flow) => flow.id == button.dataset.realize
      );

      const results = await Promise.all([
        db.from('flows').update({ status: 'Réalisé' }).eq('id', item.id),
        db.from('entries').insert({
          person: 'Commun',
          type: item.direction === 'in' ? 'Entrée réelle' : 'Retrait épargne',
          amount: item.amount,
          date: today(),
          note: JSON.stringify({
            category: 'Flux projet',
            comment: item.label,
          }),
        }),
      ]);

      const error = results.find((result) => result.error)?.error;
      if (error) alert(error.message);
      else load();
    };
  });

  document.querySelectorAll('[data-edit-flow]').forEach((button) => {
    button.onclick = async () => {
      const item = moneyFlows().find(
        (flow) => flow.id == button.dataset.editFlow
      );
      const label = prompt('Libellé', item.label);
      if (label === null) return;
      const amount = prompt('Montant', item.amount);
      if (amount === null) return;
      const date = prompt('Date', item.date);
      if (date === null) return;

      const result = await db
        .from('flows')
        .update({ label, amount: Number(amount), date })
        .eq('id', item.id);

      if (result.error) alert(result.error.message);
      else load();
    };
  });

  document.querySelectorAll('[data-delete-flow]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm('Supprimer ?')) return;

      const result = await db
        .from('flows')
        .delete()
        .eq('id', button.dataset.deleteFlow);

      if (result.error) alert(result.error.message);
      else load();
    };
  });

  document.querySelectorAll('[data-delete-entry]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm('Supprimer ?')) return;

      const result = await db
        .from('entries')
        .delete()
        .eq('id', button.dataset.deleteEntry);

      if (result.error) alert(result.error.message);
      else load();
    };
  });

  const analysisMonth = document.querySelector('#analysisMonth');
  if (analysisMonth) {
    analysisMonth.onchange = () => {
      localStorage.setItem('analysis-month', analysisMonth.value);
      render();
    };
  }

  document.querySelectorAll('[data-mdate]').forEach((input) => {
    input.onchange = async () => {
      await db
        .from('flows')
        .update({ date: input.value })
        .eq('id', input.dataset.mdate);
      load();
    };
  });

  document.querySelectorAll('[data-mlabel]').forEach((input) => {
    input.onchange = async () => {
      await db
        .from('flows')
        .update({ label: input.value })
        .eq('id', input.dataset.mlabel);
      load();
    };
  });

  document.querySelectorAll('[data-mstatus]').forEach((select) => {
    select.onchange = async () => {
      await db
        .from('flows')
        .update({ status: select.value })
        .eq('id', select.dataset.mstatus);
      load();
    };
  });

  const addStep = document.querySelector('#addStep');
  if (addStep) {
    addStep.onclick = async () => {
      const label = prompt('Nouvelle étape');
      if (!label) return;

      await db.from('flows').insert({
        label,
        amount: steps().length + 1,
        date: today(),
        status: 'À planifier',
        direction: 'milestone',
      });
      load();
    };
  }

  document.querySelectorAll('.settingsForm').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const results = await Promise.all(
        [...data].map(([key, value]) => saveSetting(key, value))
      );
      const error = results.find((result) => result.error)?.error;
      if (error) alert(error.message);
      else load();
    };
  });

  const strategyForm = document.querySelector('#strategy');
  if (strategyForm) {
    strategyForm.onsubmit = async (event) => {
      event.preventDefault();
      const result = await saveSetting(
        'loaStrategy',
        new FormData(strategyForm).get('loaStrategy')
      );
      if (result.error) alert(result.error.message);
      else load();
    };
  }

  const logout = document.querySelector('#logout');
  if (logout) {
    logout.onclick = async () => {
      await db.auth.signOut();
      user = null;
      render();
    };
  }
}

boot();
