/* Anota Treino — Login + Onboarding (Penpot plugin).
   Monta as telas de login, cadastro, esqueci a senha, onboarding e estados de erro usando cópias dos
   componentes da biblioteca conectada "Anota Treino - Biblioteca". Só roda no arquivo "Login + Onboarding". */
const FILE_NAME = 'Login + Onboarding';
const LIB_NAME = 'Anota Treino - Biblioteca';
const UI_URL = 'https://estudio-orsi.github.io/anota-treino-telas-plugin/index.html';
const PD_NS = 'anotatreino';          // shared plugin data namespace (não depende do id do plugin)
const PD_KEY = 'telas-login-onboarding';
const W = 393, H = 852;

// ---------------------------------------------------------------- utils
const LOG = [], ERRORS = [];
const STATS = { pages: 0, screens: 0, copies: 0, texts: 0, flexBoards: 0, interactions: 0, flows: 0, arrows: 0 };
const USED = {};   // component key -> count
let PROGRESS = { done: 0, total: 1 };
function say(msg, extra) {
  LOG.push(msg);
  try { console.log('[Login + Onboarding] ' + msg); } catch (e) {}
  try { penpot.ui.sendMessage(Object.assign({ type: 'progress', msg: msg, done: PROGRESS.done, total: PROGRESS.total }, extra || {})); } catch (e) {}
}
function err(where, e) {
  const m = where + ': ' + (e && e.message ? e.message : String(e));
  ERRORS.push(m);
  try { console.warn('[Login + Onboarding] ' + m); } catch (x) {}
}
const hasTimer = typeof setTimeout === 'function';
const sleep = (ms) => (hasTimer ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());
async function waitFor(fn, ms, step) {
  const t0 = Date.now();
  for (;;) {
    let v = null; try { v = fn(); } catch (e) { v = null; }
    if (v) return v;
    if (Date.now() - t0 > (ms || 4000)) return null;
    await sleep(step || 40);
  }
}
function tryDo(where, fn) { try { return fn(); } catch (e) { err(where, e); return undefined; } }

// ---------------------------------------------------------------- library
let LIB = null;
const SETS = {};      // set name -> [{comp, props}]
const COLORS = {};    // token name -> LibraryColor
const TYPOS = {};     // 'path/name' -> LibraryTypography
const FALLBACK_HEX = { background: '#0a0a0a', foreground: '#fafafa', card: '#171717', 'muted-foreground': '#a1a1a1', brand: '#7ab8d9', border: '#2a2a2a', destructive: '#e5484d', overlay: '#000000', success: '#6fbf9f', warning: '#d9b26f' };

function findLibrary() {
  let libs = [];
  try { libs = penpot.library.connected || []; } catch (e) { libs = []; }
  const cur = penpot.currentFile;
  for (const l of libs) {
    try { if (l.name === LIB_NAME && (!cur || l.id !== cur.id)) return l; } catch (e) {}
  }
  return null;
}
function indexLibrary(lib) {
  for (const k of Object.keys(SETS)) delete SETS[k];
  for (const c of (lib.components || [])) {
    try {
      let isV = false; try { isV = !!c.isVariant(); } catch (e) { isV = false; }
      if (isV) {
        const vp = c.variantProps || {};
        (SETS[c.name] = SETS[c.name] || []).push({ comp: c, props: vp });
      } else {
        const key = (c.path ? c.path.split('/').map(x => x.trim()).filter(Boolean).join(' / ') + ' / ' : '') + c.name;
        (SETS[key] = SETS[key] || []).push({ comp: c, props: {} });
      }
    } catch (e) { err('index component', e); }
  }
  for (const c of (lib.colors || [])) { try { COLORS[c.name] = c; } catch (e) {} }
  for (const t of (lib.typographies || [])) { try { TYPOS[(t.path ? t.path.trim() + '/' : '') + t.name] = t; } catch (e) {} }
}
function findComp(set, props) {
  const list = SETS[set];
  if (!list || !list.length) throw new Error('Componente "' + set + '" não existe na biblioteca');
  props = props || {};
  const keys = Object.keys(props);
  const hit = list.find(x => keys.every(k => String(x.props[k]) === String(props[k])));
  if (hit) return hit.comp;
  err('variante', new Error(set + ' ' + JSON.stringify(props) + ' não encontrada; usei a primeira variante'));
  return list[0].comp;
}
function fill(token) {
  const c = COLORS[token];
  if (c) { try { return Object.assign({}, c.asFill()); } catch (e) {} }
  return { fillColor: FALLBACK_HEX[token] || '#ff00ff', fillOpacity: token === 'overlay' ? 0.6 : 1 };
}
function stroke(token, w, align, extra) {
  const c = COLORS[token]; let s = null;
  if (c) { try { s = Object.assign({}, c.asStroke()); } catch (e) { s = null; } }
  if (!s) s = { strokeColor: FALLBACK_HEX[token] || '#ff00ff', strokeOpacity: 1 };
  s.strokeWidth = w == null ? 1 : w; s.strokeAlignment = align || 'inner'; s.strokeStyle = 'solid';
  return Object.assign(s, extra || {});
}

// ---------------------------------------------------------------- spec constructors
// F: board with flex layout. T: text. C: copy of a library component. 
function F(o, kids) { return Object.assign({ t: 'F', kids: (kids || []).filter(Boolean) }, o || {}); }
function T(text, typo, color, o) { return Object.assign({ t: 'T', text: String(text), typo: typo || 'body/sm', color: color || 'foreground' }, o || {}); }
function C(set, props, o) { return Object.assign({ t: 'C', set: set, props: props || {} }, o || {}); }
const Space = (name) => F({ name: name || 'Espaço', w: 'fill', h: 'fill' });

// ---------------------------------------------------------------- shape building
function setSizing(s, axis, val) {
  const key = axis === 'h' ? 'horizontalSizing' : 'verticalSizing';
  try { if (s.layoutChild) { s.layoutChild[key] = val; return true; } } catch (e) {}
  try { if (s.flex) { s.flex[key] = val; return true; } } catch (e) {}
  try { s[key] = val; return true; } catch (e) { err('sizing ' + s.name + ' ' + key + '=' + val, e); }
  return false;
}
function pads(p) {
  if (p == null) return [0, 0, 0, 0];
  if (typeof p === 'number') return [p, p, p, p];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  return p;
}
function placeChild(s, n, parent) {
  if (!parent) return;
  parent.appendChild(s);
  if (n.abs) {
    tryDo('absolute ' + s.name, () => { s.layoutChild.absolute = true; });
    tryDo('zIndex ' + s.name, () => { s.layoutChild.zIndex = n.z != null ? n.z : 10; });
    tryDo('pos ' + s.name, () => { s.parentX = n.x || 0; s.parentY = n.y || 0; });
  }
  if (n.alignSelf) tryDo('alignSelf ' + s.name, () => { s.layoutChild.alignSelf = n.alignSelf; });
}
function finishSizing(s, n, isLayout) {
  if (n.w === 'fill') setSizing(s, 'h', 'fill');
  else if (n.w === 'hug' && isLayout) setSizing(s, 'h', 'auto');
  else if (typeof n.w === 'number' && s.layoutChild) tryDo('fixw', () => { s.layoutChild.horizontalSizing = 'fix'; });
  if (n.h === 'fill') setSizing(s, 'v', 'fill');
  else if (n.h === 'hug' && isLayout) setSizing(s, 'v', 'auto');
  else if (typeof n.h === 'number' && s.layoutChild) tryDo('fixh', () => { s.layoutChild.verticalSizing = 'fix'; });
}
function kidsOf(s) { let k = []; try { k = s.children || []; } catch (e) { k = []; } return k; }
function findIn(root, path) {
  let cur = root;
  for (const seg of path.split('/')) {
    let hit = null;
    const walk = (x) => { if (hit) return; for (const k of kidsOf(x)) { if (hit) return; if (k.name === seg) { hit = k; return; } walk(k); } };
    walk(cur);
    if (!hit) return null;
    cur = hit;
  }
  return cur;
}
const NAV = [];   // {shape, to}
let SCREEN_SHAPES = {};
function build(n, parent) {
  let s = null;
  switch (n.t) {
    case 'F': {
      s = penpot.createBoard();
      s.name = n.name || 'Grupo';
      const w0 = typeof n.w === 'number' ? n.w : 10, h0 = typeof n.h === 'number' ? n.h : 10;
      s.resize(Math.max(w0, 0.01), Math.max(h0, 0.01));
      tryDo('clip ' + s.name, () => { s.clipContent = !!n.clip; });
      tryDo('fills ' + s.name, () => { s.fills = n.fill ? [fill(n.fill)] : []; });
      if (n.stroke) tryDo('strokes ' + s.name, () => { s.strokes = [stroke(n.stroke)]; });
      if (n.r != null) tryDo('radius ' + s.name, () => { s.borderRadius = n.r; });
      placeChild(s, n, parent);
      const fl = s.addFlexLayout();
      STATS.flexBoards++;
      fl.dir = n.dir || 'column';
      if (n.wrap) fl.wrap = 'wrap';
      const g = n.gap || 0;
      fl.rowGap = n.rowGap != null ? n.rowGap : g;
      fl.columnGap = n.colGap != null ? n.colGap : g;
      const p = pads(n.p);
      tryDo('padding', () => { fl.topPadding = p[0]; fl.rightPadding = p[1]; fl.bottomPadding = p[2]; fl.leftPadding = p[3]; });
      fl.alignItems = n.ai || 'start';
      fl.justifyContent = n.jc || 'start';
      if (n.wrap) tryDo('alignContent', () => { fl.alignContent = 'start'; });
      for (const k of n.kids) {
        try { build(k, s); } catch (e) { err('build ' + (k.name || k.set || k.t) + ' em ' + s.name, e); }
      }
      if (n.w == null) n.w = 'hug';
      if (n.h == null) n.h = 'hug';
      finishSizing(s, n, true);
      if (n.go) NAV.push({ shape: s, to: n.go });
      break;
    }
    case 'T': {
      s = penpot.createText(n.text);
      if (!s) throw new Error('createText devolveu null para "' + n.text + '"');
      STATS.texts++;
      s.name = n.name || n.text.slice(0, 40);
      const ty = TYPOS[n.typo];
      if (ty) tryDo('typo ' + n.typo, () => ty.applyToText(s));
      else err('tipografia', new Error(n.typo + ' não existe na biblioteca'));
      tryDo('text fill', () => { s.fills = [fill(n.color)]; });
      if (n.align) tryDo('align', () => { s.align = n.align; });
      placeChild(s, n, parent);
      if (n.w === 'fill') { tryDo('grow', () => { s.growType = 'auto-height'; }); setSizing(s, 'h', 'fill'); }
      else if (typeof n.w === 'number') { tryDo('textw', () => { s.resize(n.w, Math.max(s.height || 10, 1)); }); tryDo('grow', () => { s.growType = 'auto-height'; }); }
      else tryDo('grow', () => { s.growType = 'auto-width'; });
      break;
    }
    case 'C': {
      const comp = findComp(n.set, n.props);
      s = comp.instance();
      if (!s) throw new Error('instance() devolveu null para ' + n.set);
      STATS.copies++;
      const key = n.set + (Object.keys(n.props).length ? ' (' + Object.keys(n.props).map(k => k + '=' + n.props[k]).join(', ') + ')' : '');
      USED[key] = (USED[key] || 0) + 1;
      if (n.name) tryDo('name', () => { s.name = n.name; });
      placeChild(s, n, parent);
      for (const p in (n.texts || {})) {
        const v = n.texts[p]; if (v == null || v === '') continue;
        const tx = findIn(s, p);
        if (!tx || tx.type !== 'text') { err('texto', new Error('"' + p + '" não achado em ' + n.set)); continue; }
        tryDo('characters ' + p, () => { tx.characters = String(v); });
      }
      for (const p of (n.hide || [])) {
        const h = findIn(s, p);
        if (!h) { err('esconder', new Error('"' + p + '" não achado em ' + n.set)); continue; }
        tryDo('hidden ' + p, () => { h.hidden = true; });
      }
      if (n.w === 'fill') setSizing(s, 'h', 'fill');
      if (n.h === 'fill') setSizing(s, 'v', 'fill');
      if (n.go) {
        const src = n.goPath ? findIn(s, n.goPath) : s;
        if (src) NAV.push({ shape: src, to: n.go }); else err('interação', new Error('"' + n.goPath + '" não achado em ' + n.set));
      }
      for (const g of (n.gos || [])) {
        const src = findIn(s, g[0]);
        if (src) NAV.push({ shape: src, to: g[1] }); else err('interação', new Error('"' + g[0] + '" não achado em ' + n.set));
      }
      break;
    }
    default: throw new Error('nó desconhecido ' + n.t);
  }
  return s;
}

// ---------------------------------------------------------------- reusable pieces (só cópias da biblioteca + quadros de layout)
const Btn = (label, o) => {
  o = o || {};
  return C('Button', { Variant: o.v || 'default', Size: o.size || 'lg', Icon: 'none', State: o.state || 'default' },
    { name: o.name || ('Botão ' + label), texts: { Label: label }, w: o.w === undefined ? 'fill' : o.w, go: o.go, alignSelf: o.alignSelf });
};
const Link = (label, o) => Btn(label, Object.assign({ v: 'link', size: 'sm', w: null, name: 'Link ' + label }, o || {}));
const FieldEmpty = (label, ph, help) => C('Field', { State: 'default' }, { name: 'Campo ' + label, w: 'fill',
  texts: { 'Label/Text': label, 'Input/Value': ph, 'Description': help }, hide: help ? [] : ['Description'] });
const FieldError = (label, value, msg) => C('Field', { State: 'error' }, { name: 'Campo ' + label + ' (erro)', w: 'fill',
  texts: { 'Label/Text': label, 'Input/Value': value, 'Error/Message': msg } });
const FieldFilled = (label, value, o) => F({ name: 'Campo ' + label, gap: 8, w: 'fill' }, [
  C('Label', { State: 'default' }, { name: 'Label', texts: { Text: label } }),
  C('Input', { State: o && o.focus ? 'focus' : 'filled', Size: 'md' }, { name: 'Input', texts: { Value: value }, w: 'fill' }),
  o && o.help ? T(o.help, 'body/sm', 'muted-foreground', { name: 'Ajuda', w: 'fill' }) : null]);
function field(label, ph, st) {
  st = st || {};
  if (st.error) return FieldError(label, st.value || ph, st.error);
  if (st.value) return FieldFilled(label, st.value, st);
  return FieldEmpty(label, ph, st.help);
}
const Brand = (sub) => F({ name: 'Marca', gap: 6, ai: 'center', w: 'fill' }, [
  T('ANOTA TREINO', 'display/4xl', 'brand', { name: 'Logo', align: 'center' }),
  T(sub, 'body/sm', 'muted-foreground', { name: 'Frase', align: 'center' })]);
const Ou = () => C('Separator', { Orientation: 'label' }, { name: 'Divisor ou', texts: { Label: 'ou' }, w: 'fill' });
const Footer = (q, link, go) => F({ name: 'Rodapé', dir: 'row', gap: 4, ai: 'center', jc: 'center', w: 'fill' }, [
  T(q, 'body/sm', 'muted-foreground', { name: 'Pergunta' }), Link(link, { go: go })]);
const Toast = (type, title, o) => C('Sonner', { Type: type }, { name: 'Aviso', abs: true, x: 25, y: o && o.bottom ? 636 : 56,
  texts: Object.assign({ 'Text/Title': title }, o && o.action ? { 'Action/Label': o.action } : {}),
  hide: type === 'default' ? ['Text/Description'] : [], go: o && o.go });
const Overlay = (child, bottom) => F({ name: 'Fundo escuro', abs: true, x: 0, y: 0, w: W, h: H, fill: 'overlay',
  jc: bottom ? 'end' : 'center', ai: 'center', p: bottom ? 0 : [0, 33, 0, 33] }, [child]);
const AlertBox = (variant, title, desc) => C('Alert', { Variant: variant }, { name: 'Alerta', w: 'fill', texts: { 'Text/Title': title, 'Text/Description': desc } });
const Opt = (title, desc, sel, go) => C('Card', { Variant: sel ? 'highlight' : 'default' }, { name: 'Opção ' + title + (sel ? ' (escolhida)' : ''), w: 'fill', go: go,
  texts: { 'CardHeader/Title': title, 'CardHeader/Description': desc },
  hide: ['CardHeader/Overline', 'CardContent', 'Footer divider', 'CardFooter'].concat(desc ? [] : ['CardHeader/Description']) });
const Chip = (label, on) => C('Toggle', { Variant: 'outline', Size: 'md', State: on ? 'on' : 'off' }, { name: 'Opção ' + label, texts: { Label: label } });
const Header = (title, back) => C('AppHeader', { Variant: 'back' }, { name: 'Cabeçalho', w: 'fill', texts: { Title: title }, hide: ['More'], goPath: 'Back', go: back });
const Section = (label, kids) => F({ name: label, gap: 10, w: 'fill' }, [T(label, 'body/sm-medium', 'foreground', { name: 'Rótulo' })].concat(kids));

// ---------------------------------------------------------------- screen templates
const SCREEN = (o, kids) => F({ name: o.name, w: W, h: H, fill: 'background', clip: true, dir: 'column',
  p: o.p != null ? o.p : [64, 24, 40, 24], gap: o.gap != null ? o.gap : 24, jc: o.jc || 'start', ai: o.ai || 'start' }, kids);

const USER = 'alex.treino', EMAIL = 'voce@email.com', PASS = '••••••••';
function login(o) {
  o = o || {};
  const form = [
    T('Entrar', 'heading/xl', 'foreground', { name: 'Título' }),
    o.alert || null,
    field('Nome de usuário', 'Digite seu usuário', o.user),
    field('Senha', 'Digite sua senha', o.pass),
    o.forgot ? F({ name: 'Linha esqueci a senha', dir: 'row', jc: 'end', w: 'fill' }, [Link('Esqueci a senha', { go: o.forgotGo })]) : null,
    Btn(o.btn || 'Entrar', { name: 'Botão Entrar', state: o.btnState, go: o.go }),
    Ou(),
    Btn('Entrar com Google', { v: 'outline', name: 'Botão Google', go: o.googleGo })];
  return { jc: 'center', kids: [Brand('Bem-vindo de volta.'), F({ name: 'Formulário', gap: 16, w: 'fill' }, form),
    Footer('Não tem conta?', 'Criar conta', o.signupGo), o.toast || null, o.overlay || null] };
}
function signup(o) {
  o = o || {};
  const form = [
    T('Criar conta', 'heading/xl', 'foreground', { name: 'Título' }),
    field('E-mail', 'Seu e-mail', o.email),
    o.alert || null,
    Btn('Continuar', { name: 'Botão Continuar', go: o.go }),
    Ou(),
    Btn('Entrar com Google', { v: 'outline', name: 'Botão Google' })];
  return { jc: 'center', kids: [Brand('Registre. Evolua. Supere.'), F({ name: 'Formulário', gap: 16, w: 'fill' }, form),
    Footer('Já tenho conta —', 'Entrar', o.loginGo), o.toast || null] };
}
function step(o) {
  return { p: [0, 0, 32, 0], gap: 16, kids: [
    Header(o.header, o.back),
    F({ name: 'Conteúdo', gap: 20, p: [8, 24, 0, 24], w: 'fill', h: 'fill' }, [
      o.progress != null ? C('Progress', { Variant: 'brand', Value: String(o.progress) }, { name: 'Progresso', w: 'fill' }) : null,
      F({ name: 'Texto', gap: 8, w: 'fill' }, [
        T(o.title, 'heading/2xl', 'foreground', { name: 'Título', w: 'fill' }),
        o.desc ? T(o.desc, 'body/base', 'muted-foreground', { name: 'Descrição', w: 'fill' }) : null]),
    ].concat(o.body || [])),
    F({ name: 'Ações', gap: 8, p: [0, 24, 0, 24], w: 'fill' }, o.actions || []),
    o.toast || null, o.overlay || null] };
}
function message(o) {
  return { kids: [
    o.top || Space('Espaço de cima'),
    F({ name: 'Mensagem', gap: 16, ai: 'center', w: 'fill' }, [
      C('IconCircle', { Tone: o.tone || 'success', Size: 'lg' }, { name: 'Ícone' }),
      T(o.title, 'heading/2xl', 'foreground', { name: 'Título', align: 'center', w: 'fill' }),
      T(o.desc, 'body/base', 'muted-foreground', { name: 'Descrição', align: 'center', w: 'fill' })]),
    Space('Espaço de baixo'),
    F({ name: 'Ações', gap: 8, w: 'fill' }, o.actions || []),
    o.toast || null] };
}
function slide(n, title, desc, illu, next) {
  return { p: [56, 24, 32, 24], gap: 20, kids: [
    F({ name: 'Topo', dir: 'row', jc: 'end', w: 'fill' }, [T(n + ' / 4', 'body/sm', 'muted-foreground', { name: 'Contador' })]),
    F({ name: 'Ilustração', gap: 12, w: 'fill', h: 'fill', clip: true, go: next }, illu),
    F({ name: 'Texto', gap: 8, ai: 'center', w: 'fill' }, [
      T(title, 'heading/2xl', 'foreground', { name: 'Título', align: 'center', w: 'fill' }),
      T(desc, 'body/base', 'muted-foreground', { name: 'Descrição', align: 'center', w: 'fill' })]),
    C('Steps', { Count: '4', Current: String(n) }, { name: 'Indicador', alignSelf: 'center' }),
    F({ name: 'Ações', gap: 4, w: 'fill' }, [
      Btn('Criar conta — é grátis', { name: 'Botão Criar conta' }),
      Btn('Já tenho conta', { v: 'ghost', size: 'md', name: 'Botão Já tenho conta' })])] };
}
const NAV_PT = { 'Tab Home/Label': 'Home', 'Tab Workout/Label': 'Treinar', 'Tab History/Label': 'Histórico', 'Tab Friends/Label': 'Amigos', 'Tab Profile/Label': 'Perfil' };
const BottomNav = () => C('BottomNav', { Active: 'home' }, { name: 'Menu', w: 'fill', texts: NAV_PT });
const setRow = (state, n, kg, reps, rpe) => C('SetRow', { State: state }, { name: 'Série ' + n, w: 'fill',
  texts: { 'Set/Number': String(n), 'Cell Kg/Value': kg, 'Cell Reps/Value': reps, 'Cell RPE/Value': rpe } });
function homeFirst() {
  return [
    C('AppHeader', { Variant: 'profile' }, { name: 'Cabeçalho', w: 'fill',
      texts: { 'Heading/Overline': 'BOM TREINO,', 'Heading/Title': 'Alex', 'Actions/XP badge/XP': '0 XP', 'Actions/Avatar/Initials': 'AL' } }),
    F({ name: 'Conteúdo', gap: 16, p: [8, 24, 24, 24], w: 'fill', h: 'fill' }, [
      F({ name: 'Resumo', dir: 'row', gap: 12, w: 'fill' }, [
        C('StatCard', { Variant: 'highlight', Size: 'md' }, { name: 'Streak', w: 'fill', texts: { 'Header/Overline': 'Streak', Value: '0', Caption: 'dias seguidos' }, hide: ['Meta'] }),
        C('StatCard', { Variant: 'default', Size: 'md' }, { name: 'Protocolo', w: 'fill', texts: { 'Header/Overline': 'Protocolo', Value: '0', Caption: 'dias na divisão' }, hide: ['Meta', 'Header/Icon'] })]),
      C('WorkoutCard', { Variant: 'empty' }, { name: 'Primeiro protocolo', w: 'fill',
        texts: { 'Header/Title': 'Monte seu primeiro protocolo', 'Header/Description': 'Crie sua divisão do zero ou importe uma com código.',
          'Actions/Create/Label': 'Criar protocolo', 'Actions/Import/Label': 'Importar com código' } })]),
    BottomNav()];
}
function skeletonHome(extra) {
  return [
    F({ name: 'Topo', gap: 8, p: [56, 24, 0, 24], w: 'fill' }, [C('Skeleton', { Shape: 'text' }, { name: 'Linha 1' }), C('Skeleton', { Shape: 'heading' }, { name: 'Linha 2' })]),
    F({ name: 'Conteúdo', gap: 16, p: [16, 24, 0, 24], w: 'fill', h: 'fill' }, [
      F({ name: 'Resumo', dir: 'row', gap: 12, w: 'fill' }, [C('Skeleton', { Shape: 'card' }, { name: 'Bloco 1', w: 'fill' }), C('Skeleton', { Shape: 'card' }, { name: 'Bloco 2', w: 'fill' })]),
      C('Skeleton', { Shape: 'card' }, { name: 'Bloco 3', w: 'fill' }),
      C('Skeleton', { Shape: 'text' }, { name: 'Linha 3', w: 'fill' }),
      C('Skeleton', { Shape: 'text' }, { name: 'Linha 4' })]),
    BottomNav()].concat(extra || []);
}

// ---------------------------------------------------------------- screens
// status: 'real' = recriação de tela capturada do app · 'variacao' = outro estado de uma tela real · 'proposta' = cenário novo
const S = {};
function scr(id, name, status, ref, def) { S[id] = { id: id, name: name, status: status, ref: ref || '', def: def }; }
const q4 = (n) => n * 25;

// ----- Onboarding
scr('ON01', 'Abertura', 'proposta', 'Baseada no estado "Carregando" do arquivo Fluxos', () => ({ jc: 'center', ai: 'center', gap: 32, kids: [
  Brand('Registre. Evolua. Supere.'), C('Spinner', { Size: 'md' }, { name: 'Carregando' })] }));
scr('ON02', 'Apresentação 1 — Tudo em um lugar', 'real', 'Captura 31', () => slide(1, 'Tudo em um lugar', 'Streak, trilha semanal e próximo treino — tudo na sua home.', [
  F({ name: 'Resumo', dir: 'row', gap: 12, w: 'fill' }, [
    C('StatCard', { Variant: 'highlight', Size: 'md' }, { name: 'Streak', w: 'fill', texts: { 'Header/Overline': 'Streak', Value: '9', Caption: 'dias seguidos' }, hide: ['Meta'] }),
    C('StatCard', { Variant: 'default', Size: 'md' }, { name: 'Protocolo', w: 'fill', texts: { 'Header/Overline': 'Protocolo', Value: '5', Caption: 'dias no split', Meta: '9 sessões' }, hide: ['Header/Icon'] })]),
  C('WorkoutCard', { Variant: 'default' }, { name: 'Próximo treino', w: 'fill', texts: {
    'Header/Overline': 'Próximo treino · 6 exercícios', 'Header/Title': 'Pernas',
    'Exercise 1/Name': 'Levantamento terra', 'Exercise 1/Sets': '1×', 'Exercise 2/Name': 'Mesa flexora', 'Exercise 2/Sets': '3×',
    'Exercise 3/Name': 'Stiff unilateral', 'Exercise 3/Sets': '2×', 'Exercise 4/Name': 'Elevação pélvica', 'Exercise 4/Sets': '2×',
    'More': '+2 mais', 'Action/Label': 'Iniciar treino' } })], 'ON03'));
scr('ON03', 'Apresentação 2 — Registre em segundos', 'real', 'Captura 32', () => slide(2, 'Registre em segundos', 'Séries, cargas e RIR/RPE. O sistema detecta quando você evoluiu.', [
  T('Rosca direta no cabo', 'heading/lg', 'foreground', { name: 'Exercício', w: 'fill' }),
  setRow('done', 1, '55', '10', '1'), setRow('done', 2, '55', '10', '0'), setRow('filled', 3, '60', '10', '0'), setRow('empty', 4, '', '', '')], 'ON04'));
scr('ON04', 'Apresentação 3 — Veja sua evolução', 'real', 'Captura 33', () => slide(3, 'Veja sua evolução', 'Gráfico de carga máxima e tonelagem acumulada por exercício.', [
  C('Chart', { Type: 'line' }, { name: 'Carga máxima', w: 'fill', texts: { Overline: 'Carga máxima · kg', Value: '46 kg' } }),
  C('StatCard', { Variant: 'default', Size: 'wide' }, { name: 'Tonelagem', w: 'fill', texts: { 'Header/Overline': 'Tonelagem acumulada · 30 dias', Value: '3.436 kg', Caption: 'Supino reto máquina' }, hide: ['Header/Icon'] })], 'ON05'));
scr('ON05', 'Apresentação 4 — Para o personal trainer', 'real', 'Captura 34', () => slide(4, 'Para o personal trainer', 'Gerencie seus alunos, prescreva protocolos e acompanhe o progresso de cada um.', [
  C('AppHeader', { Variant: 'large' }, { name: 'Painel', w: 'fill', texts: { 'Heading/Overline': 'Painel', 'Heading/Title': 'Meus alunos', 'Action/Label': 'Convidar' } }),
  C('Item', { Variant: 'default', Size: 'md', Trailing: 'chevron' }, { name: 'Aluno 1', w: 'fill', texts: { 'ItemContent/Title': 'Aluno 1', 'ItemContent/Description': 'Vinculado em 04/05/2026' } }),
  C('Item', { Variant: 'default', Size: 'md', Trailing: 'chevron' }, { name: 'Aluno 2', w: 'fill', texts: { 'ItemContent/Title': 'Aluno 2', 'ItemContent/Description': 'Vinculado em 04/05/2026' } }),
  C('Item', { Variant: 'default', Size: 'md', Trailing: 'chevron' }, { name: 'Aluno 3', w: 'fill', texts: { 'ItemContent/Title': 'Aluno 3', 'ItemContent/Description': 'Vinculado em 02/06/2026' } })]));
function q1(overlay) {
  return step({ header: 'Etapa 1 de 4', progress: q4(1), title: 'Como você vai usar o Anota Treino?', desc: 'Isso ajuda a mostrar o que importa para você.',
    body: [F({ name: 'Opções', gap: 12, w: 'fill' }, [
      Opt('Vou registrar meus treinos', 'Anote séries, cargas e acompanhe sua evolução.', true),
      Opt('Sou personal trainer', 'Gerencie alunos e prescreva protocolos.', false)])],
    actions: [Btn('Continuar', { go: 'ON07' }), Btn('Pular por agora', { v: 'ghost', size: 'md', go: 'ON14' })], overlay: overlay });
}
scr('ON06', 'Pergunta 1 — Como vai usar', 'proposta', '', () => q1());
scr('ON07', 'Pergunta 2 — Objetivo', 'proposta', '', () => step({ header: 'Etapa 2 de 4', back: 'ON06', progress: q4(2), title: 'Qual é o seu objetivo principal?', desc: 'Você pode mudar isso quando quiser.',
  body: [F({ name: 'Opções', gap: 12, w: 'fill' }, [
    Opt('Ganhar massa muscular', '', true), Opt('Ficar mais forte', '', false), Opt('Perder gordura', '', false), Opt('Manter a rotina de treinos', '', false)])],
  actions: [Btn('Continuar', { go: 'ON08' }), Btn('Pular por agora', { v: 'ghost', size: 'md' })] }));
scr('ON08', 'Pergunta 3 — Experiência', 'proposta', '', () => step({ header: 'Etapa 3 de 4', back: 'ON07', progress: q4(3), title: 'Há quanto tempo você treina?', desc: 'Usamos isso para sugerir o ritmo das primeiras semanas.',
  body: [F({ name: 'Opções', gap: 12, w: 'fill' }, [
    Opt('Estou começando agora', '', false), Opt('Menos de 1 ano', '', true), Opt('De 1 a 3 anos', '', false), Opt('Mais de 3 anos', '', false)])],
  actions: [Btn('Continuar', { go: 'ON09' }), Btn('Pular por agora', { v: 'ghost', size: 'md' })] }));
scr('ON09', 'Pergunta 4 — Rotina e registro', 'proposta', 'RIR / RPE / Nenhuma vêm da tela Editar zona (captura 05)', () => step({ header: 'Etapa 4 de 4', back: 'ON08', progress: q4(4), title: 'Como é a sua rotina?', desc: '',
  body: [
    Section('Dias de treino por semana', [F({ name: 'Dias', dir: 'row', wrap: true, gap: 8, w: 'fill' }, [Chip('2', false), Chip('3', false), Chip('4', true), Chip('5', false), Chip('6', false)])]),
    Section('Como você mede o esforço', [C('ToggleGroup', { Variant: 'outline', Value: 'first' }, { name: 'Esforço', texts: { 'Item 1/Label': 'RIR', 'Item 2/Label': 'RPE', 'Item 3/Label': 'Nenhuma' } })]),
    Section('Peso das cargas', [C('ToggleGroup', { Variant: 'outline', Value: 'first' }, { name: 'Peso', texts: { 'Item 1/Label': 'kg', 'Item 2/Label': 'lb' }, hide: ['Item 3'] })])],
  actions: [Btn('Concluir', { go: 'ON10' }), Btn('Pular por agora', { v: 'ghost', size: 'md' })] }));
function reminders(overlay) {
  return message({ tone: 'muted', title: 'Quer lembretes para treinar?', desc: 'Avisamos no dia do treino e quando seu streak estiver em risco.',
    actions: [Btn('Ativar lembretes', { go: 'ON11' }), Btn('Agora não', { v: 'ghost', size: 'md', go: 'ON12' })], toast: overlay });
}
scr('ON10', 'Lembretes', 'proposta', '', () => reminders());
scr('ON11', 'Permissão de notificações', 'proposta', 'Ilustrativa: no celular, quem mostra esta janela é o sistema', () => reminders(Overlay(
  C('AlertDialog', { Variant: 'default' }, { name: 'Janela do sistema', texts: { 'AlertDialogHeader/Title': '"Anota Treino" quer enviar notificações',
    'AlertDialogHeader/Description': 'Alertas, sons e ícones. Você pode mudar isso nos ajustes do celular.',
    'AlertDialogFooter/Action/Label': 'Permitir', 'AlertDialogFooter/Cancel/Label': 'Não permitir' }, hide: ['IconCircle'], gos: [['AlertDialogFooter/Action', 'ON12'], ['AlertDialogFooter/Cancel', 'ON12']] }))));
scr('ON12', 'Tudo pronto', 'proposta', '', () => message({ tone: 'success', title: 'Tudo pronto!', desc: 'Agora monte seu protocolo do zero ou importe um com código.',
  actions: [Btn('Ir para a Home', { go: 'ON13' })] }));
scr('ON13', 'Home — primeira vez', 'proposta', 'Home real fica no arquivo Fluxos; aqui é o estado sem protocolo', () => ({ p: 0, gap: 0, kids: homeFirst() }));
scr('ON14', 'Pular as perguntas?', 'proposta', '', () => q1(Overlay(C('AlertDialog', { Variant: 'default' }, { name: 'Confirmação', texts: {
  'AlertDialogHeader/Title': 'Pular as perguntas?', 'AlertDialogHeader/Description': 'Você pode ajustar suas preferências depois.',
  'AlertDialogFooter/Action/Label': 'Pular', 'AlertDialogFooter/Cancel/Label': 'Continuar respondendo' }, gos: [['AlertDialogFooter/Action', 'ON13'], ['AlertDialogFooter/Cancel', 'ON06']] }))));

// ----- Login
scr('LG01', 'Login', 'real', 'Captura 30 (o app real não mostra "Esqueci a senha")', () => login({ googleGo: 'LG08' }));
scr('LG02', 'Login preenchido', 'variacao', '', () => login({ user: { value: USER }, pass: { value: PASS }, forgot: true, go: 'LG03' }));
scr('LG03', 'Entrando', 'variacao', '', () => login({ user: { value: USER }, pass: { value: PASS }, forgot: true, btn: 'Entrando…', btnState: 'disabled' }));
scr('LG04', 'Campos vazios', 'variacao', '', () => login({ user: { error: 'Preencha o nome de usuário.', value: 'Digite seu usuário' }, pass: { error: 'Preencha a senha.', value: 'Digite sua senha' }, forgot: true }));
scr('LG05', 'Usuário ou senha incorretos', 'proposta', '', () => login({ alert: AlertBox('destructive', 'Não foi possível entrar', 'Nome de usuário ou senha incorretos.'),
  user: { value: USER }, pass: { value: PASS }, forgot: true, go: 'LG06' }));
scr('LG06', 'Muitas tentativas', 'proposta', '', () => login({ alert: AlertBox('warning', 'Muitas tentativas', 'Aguarde alguns minutos ou crie uma nova senha.'),
  user: { value: USER }, pass: { value: PASS }, forgot: true, btnState: 'disabled' }));
scr('LG07', 'Sem conexão ao entrar', 'proposta', '', () => login({ user: { value: USER }, pass: { value: PASS }, forgot: true, go: 'LG03',
  toast: Toast('error', 'Sem conexão. Tente de novo.') }));
scr('LG08', 'Escolher conta Google', 'proposta', 'Ilustrativa: a janela de contas é do Google', () => login({ overlay: Overlay(C('Drawer', { Variant: 'options' }, { name: 'Contas Google', w: 'fill', texts: {
  'DrawerHeader/Title': 'Continuar com o Google', 'DrawerHeader/Description': 'Escolha uma conta para entrar no Anota Treino.',
  'Options/Option 1/Label': 'voce@gmail.com', 'Options/Option 2 row/Option 2/Label': 'Usar outra conta', 'DrawerFooter/Not now/Label': 'Cancelar' },
  hide: ['Options/Option 2 row/Badge', 'Options/Option 3'], gos: [['Options/Option 1', 'LG03'], ['DrawerFooter/Not now', 'LG09']] }), true) }));
scr('LG09', 'Google cancelado', 'proposta', '', () => login({ googleGo: 'LG08', toast: Toast('default', 'Login com Google cancelado.') }));
scr('LG10', 'Primeiro acesso com Google', 'proposta', '', () => ({ jc: 'center', ai: 'center', gap: 32, kids: [
  Brand('Registre. Evolua. Supere.'), C('Spinner', { Size: 'md' }, { name: 'Carregando' }), T('Criando sua conta…', 'body/base', 'muted-foreground', { name: 'Status' })] }));

// ----- Cadastro
scr('CD01', 'Criar conta', 'real', 'Captura 35', () => signup({}));
scr('CD02', 'E-mail preenchido', 'variacao', '', () => signup({ email: { value: EMAIL }, go: 'CD03' }));
function account(o) {
  o = o || {};
  return step({ header: 'Criar conta', back: 'CD02', title: 'Quase lá', desc: 'Escolha como você vai entrar no Anota Treino.',
    body: [
      field('Nome de usuário', 'Ex.: alex.treino', o.user || { help: 'Aparece para seus amigos no ranking.' }),
      o.suggest || null,
      field('Senha', 'Crie uma senha', o.pass || { help: 'Mínimo de 8 caracteres, com letras e números.' }),
      F({ name: 'Termos', dir: 'row', gap: 10, ai: 'start', w: 'fill' }, [
        C('Checkbox', { Checked: o.terms ? 'true' : 'false', State: 'default' }, { name: 'Aceite' }),
        T('Li e aceito os Termos de uso e a Política de privacidade.', 'body/sm', 'muted-foreground', { name: 'Texto dos termos', w: 'fill' })]),
      o.alert || null,
      Link('Ler os Termos de uso', { go: 'CD15' })],
    actions: [Btn('Criar conta', { go: o.go })], toast: o.toast });
}
scr('CD03', 'Escolher usuário e senha', 'proposta', 'O app real pede só o e-mail na primeira etapa; o que vem depois não foi visto', () => account({}));
scr('CD04', 'Usuário e senha preenchidos', 'proposta', '', () => account({ user: { value: USER }, pass: { value: PASS }, terms: true, go: 'CD05' }));
function otp(o) {
  o = o || {};
  return step({ header: 'Confirmar e-mail', back: 'CD04', title: 'Confirme seu e-mail', desc: 'Enviamos um código de 6 dígitos para ' + EMAIL + '.',
    body: [C('InputOTP', { State: o.state || 'active', Length: '6' }, { name: 'Código', texts: o.digits ? { 'Slot 1/Char': o.digits[0], 'Slot 2/Char': o.digits[1], 'Slot 3/Char': o.digits[2], 'Slot 4/Char': o.digits[3], 'Slot 5/Char': o.digits[4], 'Slot 6/Char': o.digits[5] } : {} }),
      o.error ? T(o.error, 'body/sm', 'destructive', { name: 'Erro', w: 'fill' }) : null],
    actions: [Btn('Confirmar', { go: o.go }), Btn('Reenviar código', { v: 'ghost', size: 'md', go: o.resendGo })], toast: o.toast });
}
scr('CD05', 'Confirmar e-mail', 'proposta', '', () => otp({ go: 'CD06', resendGo: 'CD14' }));
scr('CD06', 'Conta criada', 'proposta', '', () => message({ tone: 'success', title: 'Conta criada!', desc: 'Agora responda 4 perguntas rápidas para começar.', actions: [Btn('Começar')] }));
scr('CD07', 'E-mail vazio', 'variacao', '', () => signup({ email: { error: 'Informe seu e-mail.', value: 'Seu e-mail' } }));
scr('CD08', 'E-mail inválido', 'variacao', '', () => signup({ email: { error: 'Digite um e-mail válido, como voce@email.com.', value: 'voce@email' } }));
scr('CD09', 'E-mail já cadastrado', 'variacao', '', () => signup({ email: { error: 'Este e-mail já tem uma conta.', value: EMAIL },
  alert: AlertBox('default', 'Já tem conta?', 'Entre com seu nome de usuário e senha.'), loginGo: null }));
scr('CD10', 'Senha fraca', 'proposta', '', () => account({ user: { value: USER }, pass: { error: 'Use 8 caracteres ou mais, com letras e números.', value: '••••' }, terms: true }));
scr('CD11', 'Nome de usuário em uso', 'proposta', '', () => account({ user: { error: 'Este nome de usuário já está em uso.', value: 'alex' },
  suggest: F({ name: 'Sugestões', dir: 'row', wrap: true, gap: 8, w: 'fill' }, [Chip('alex.treino', false), Chip('alex_fit', false)]), pass: { value: PASS }, terms: true }));
scr('CD12', 'Termos não aceitos', 'proposta', '', () => account({ user: { value: USER }, pass: { value: PASS }, terms: false,
  alert: AlertBox('destructive', 'Aceite os termos', 'Para criar a conta, aceite os Termos de uso e a Política de privacidade.') }));
scr('CD13', 'Código incorreto', 'proposta', '', () => otp({ state: 'error', digits: '482917', error: 'Código incorreto. Confira e tente de novo.', resendGo: 'CD14' }));
scr('CD14', 'Código reenviado', 'proposta', '', () => otp({ state: 'default', toast: Toast('success', 'Enviamos um novo código.', { bottom: true }) }));
scr('CD15', 'Termos de uso', 'proposta', 'Texto dos termos ainda a definir', () => ({ p: [0, 0, 32, 0], gap: 16, kids: [
  Header('Termos de uso', 'CD03'),
  F({ name: 'Conteúdo', gap: 16, p: [8, 24, 0, 24], w: 'fill', h: 'fill' }, [
    T('Última atualização: dd/mm/aaaa', 'body/xs', 'muted-foreground', { name: 'Data' }),
    T('1. Sobre o serviço', 'heading/lg', 'foreground', { name: 'Seção 1' }),
    T('Texto dos termos de uso a definir. Este bloco mostra o espaço e o estilo do conteúdo.', 'body/sm', 'muted-foreground', { name: 'Parágrafo 1', w: 'fill' }),
    T('2. Seus dados', 'heading/lg', 'foreground', { name: 'Seção 2' }),
    T('Texto sobre privacidade a definir. Explique quais dados são guardados e como pedir a exclusão da conta.', 'body/sm', 'muted-foreground', { name: 'Parágrafo 2', w: 'fill' })]),
  F({ name: 'Ações', gap: 8, p: [0, 24, 0, 24], w: 'fill' }, [Btn('Voltar', { v: 'outline', go: 'CD03' })])] }));

// ----- Esqueci a senha (tudo proposta: o app real não mostra esse link)
scr('ES01', 'Login com "Esqueci a senha"', 'proposta', 'Mesmo login da captura 30, com o link novo', () => login({ forgot: true, forgotGo: 'ES02' }));
function forgot(o) {
  o = o || {};
  return step({ header: 'Recuperar acesso', title: 'Esqueceu a senha?', desc: 'Informe o e-mail da sua conta. Vamos enviar um link para criar uma nova senha.',
    body: [field('E-mail', 'Seu e-mail', o.email)], actions: [Btn('Enviar link', { go: o.go })] });
}
scr('ES02', 'Recuperar acesso', 'proposta', '', () => forgot({ email: { value: EMAIL }, go: 'ES03' }));
function sent(toast) {
  return message({ tone: 'success', title: 'Confira seu e-mail', desc: 'Se existir uma conta com ' + EMAIL + ', você vai receber um link em alguns minutos.',
    actions: [Btn('Voltar para o login'), Btn('Reenviar link', { v: 'ghost', size: 'md', go: toast ? null : 'ES10' })], toast: toast });
}
scr('ES03', 'E-mail enviado', 'proposta', '', () => sent());
function newPass(o) {
  o = o || {};
  return step({ header: 'Nova senha', title: 'Crie uma nova senha', desc: 'Ela vai substituir a senha antiga.',
    body: [field('Nova senha', 'Digite a nova senha', o.p1 || { help: 'Mínimo de 8 caracteres, com letras e números.' }),
      field('Confirme a nova senha', 'Digite de novo', o.p2)],
    actions: [Btn('Salvar nova senha', { go: o.go })] });
}
scr('ES04', 'Nova senha', 'proposta', 'Aberta pelo link do e-mail', () => newPass({ p1: { value: PASS }, p2: { value: PASS }, go: 'ES05' }));
scr('ES05', 'Senha alterada', 'proposta', '', () => message({ tone: 'success', title: 'Senha alterada', desc: 'Use a nova senha para entrar.', actions: [Btn('Entrar')] }));
scr('ES06', 'E-mail inválido', 'proposta', '', () => forgot({ email: { error: 'Digite um e-mail válido, como voce@email.com.', value: 'voce@' } }));
scr('ES07', 'Senhas diferentes', 'proposta', '', () => newPass({ p1: { value: PASS }, p2: { error: 'As senhas não são iguais.', value: '•••••••' } }));
scr('ES08', 'Senha fraca', 'proposta', '', () => newPass({ p1: { error: 'Use 8 caracteres ou mais, com letras e números.', value: '••••' }, p2: { value: '••••' } }));
scr('ES09', 'Link vencido', 'proposta', '', () => ({ jc: 'center', kids: [
  C('Empty', { Variant: 'outline' }, { name: 'Link vencido', w: 'fill', texts: { 'EmptyHeader/Title': 'Este link venceu', 'EmptyHeader/Description': 'Peça um novo link para criar sua senha.', 'Action/Label': 'Pedir novo link' }, hide: ['Action/Icon'], goPath: 'Action', go: 'ES02' })] }));
scr('ES10', 'Link reenviado', 'proposta', '', () => sent(Toast('success', 'Link reenviado para ' + EMAIL + '.')));

// ----- Estados e erros
scr('EE01', 'Sem conexão', 'proposta', 'Já estava no Fluxos como cenário novo', () => ({ jc: 'center', gap: 32, kids: [
  Brand('Registre. Evolua. Supere.'),
  C('Empty', { Variant: 'default' }, { name: 'Sem conexão', w: 'fill', texts: { 'EmptyHeader/Title': 'Sem conexão', 'EmptyHeader/Description': 'Não foi possível conectar ao Anota Treino. Verifique sua internet.', 'Action/Label': 'Tentar novamente' }, hide: ['Action/Icon'] })] }));
scr('EE02', 'Erro inesperado', 'proposta', 'Texto do Fluxos: "Algo deu errado. Tente de novo."', () => login({ user: { value: USER }, pass: { value: PASS }, forgot: true,
  toast: Toast('action', 'Algo deu errado. Tente de novo.', { action: 'Tentar' }) }));
scr('EE03', 'Sessão expirada', 'proposta', '', () => ({ p: 0, gap: 0, kids: skeletonHome([Overlay(C('AlertDialog', { Variant: 'default' }, { name: 'Sessão expirada', texts: {
  'AlertDialogHeader/Title': 'Sua sessão expirou', 'AlertDialogHeader/Description': 'Entre de novo para continuar de onde parou.', 'AlertDialogFooter/Action/Label': 'Entrar' },
  hide: ['AlertDialogFooter/Cancel'] }))]) }));
scr('EE04', 'Carregando a Home', 'proposta', '', () => ({ p: 0, gap: 0, kids: skeletonHome() }));
S.HOME = { id: 'HOME', name: 'Home (arquivo Fluxos)', status: 'real', ref: 'Captura 03', def: null, external: true };

// ---------------------------------------------------------------- pages and rows
const PAGES = [
  { name: 'Onboarding', rows: [
    { title: 'Abertura e apresentação', desc: 'O carrossel de 4 telas é do app real (capturas 31 a 34). A abertura é proposta.', ids: ['ON01', 'ON02', 'ON03', 'ON04', 'ON05'] },
    { title: 'Perguntas iniciais', desc: 'Proposta: o app real não mostra perguntas depois do cadastro. Etapas curtas, com opção de pular.', ids: ['ON06', 'ON07', 'ON08', 'ON09'] },
    { title: 'Lembretes e chegada na Home', desc: 'Proposta: pedido de notificações e a Home antes do primeiro protocolo.', ids: ['ON10', 'ON11', 'ON12', 'ON13'] },
    { title: 'Pular as perguntas', desc: 'Proposta: confirmação antes de pular.', ids: ['ON14'] }] },
  { name: 'Login', rows: [
    { title: 'Entrar com usuário e senha', desc: 'O login do app real usa nome de usuário e senha (captura 30).', ids: ['LG01', 'LG02', 'LG03'] },
    { title: 'Erros do login', desc: 'Campos vazios, dados errados, muitas tentativas e falta de internet.', ids: ['LG04', 'LG05', 'LG06', 'LG07'] },
    { title: 'Entrar com Google', desc: 'O botão existe no app real; as telas depois dele são propostas.', ids: ['LG08', 'LG09', 'LG10'] }] },
  { name: 'Cadastro', rows: [
    { title: 'Criar conta com e-mail', desc: 'A primeira tela é do app real (captura 35). As etapas seguintes são propostas.', ids: ['CD01', 'CD02', 'CD03', 'CD04', 'CD05', 'CD06'] },
    { title: 'Erros do e-mail', desc: 'Variações da tela real de criar conta.', ids: ['CD07', 'CD08', 'CD09'] },
    { title: 'Erros de usuário, senha e termos', desc: 'Proposta.', ids: ['CD10', 'CD11', 'CD12'] },
    { title: 'Confirmação do e-mail', desc: 'Proposta: código de 6 dígitos.', ids: ['CD13', 'CD14'] },
    { title: 'Termos de uso', desc: 'Proposta: texto a definir.', ids: ['CD15'] }] },
  { name: 'Esqueci a senha', rows: [
    { title: 'Recuperar a senha', desc: 'Proposta: o app real não mostra o link "Esqueci a senha".', ids: ['ES01', 'ES02', 'ES03', 'ES04', 'ES05'] },
    { title: 'Erros da recuperação', desc: 'Proposta.', ids: ['ES06', 'ES07', 'ES08', 'ES09', 'ES10'] }] },
  { name: 'Estados e erros', rows: [
    { title: 'Estados gerais', desc: 'Sem conexão e erro inesperado já estavam no Fluxos como cenários novos.', ids: ['EE01', 'EE02', 'EE03', 'EE04'] }] },
];
// Fluxos: cada linha é um caminho: [tela, 'ação', tela, 'ação', tela...]
const CHAINS = [
  { title: 'Primeiro acesso — caminho principal', steps: ['ON01', 'abre o app sem login', 'ON02', 'desliza', 'ON03', 'desliza', 'ON04', 'desliza', 'ON05', 'Criar conta — é grátis', 'CD01', 'digita o e-mail', 'CD02', 'Continuar', 'CD03', 'preenche e aceita os termos', 'CD04', 'Criar conta', 'CD05', 'código certo', 'CD06', 'Começar', 'ON06', 'Continuar', 'ON07', 'Continuar', 'ON08', 'Continuar', 'ON09', 'Concluir', 'ON10', 'Ativar lembretes', 'ON11', 'Permitir', 'ON12', 'Ir para a Home', 'ON13'] },
  { title: 'Já tenho conta', steps: ['ON02', 'Já tenho conta', 'LG01', 'preenche', 'LG02', 'Entrar', 'LG03', 'dados certos', 'EE04', 'carregou', 'HOME'] },
  { title: 'Login — campos vazios', steps: ['LG01', 'Entrar sem preencher', 'LG04', 'preenche', 'LG02'] },
  { title: 'Login — dados errados', steps: ['LG02', 'usuário ou senha errados', 'LG05', 'erra várias vezes', 'LG06', 'Esqueci a senha', 'ES02'] },
  { title: 'Login — sem internet', steps: ['LG02', 'Entrar sem internet', 'LG07', 'Entrar de novo', 'LG03'] },
  { title: 'Google — conta já cadastrada', steps: ['LG01', 'Entrar com Google', 'LG08', 'escolhe a conta', 'LG03'] },
  { title: 'Google — cancelado', steps: ['LG08', 'Cancelar', 'LG09'] },
  { title: 'Google — conta nova', steps: ['LG08', 'conta sem cadastro', 'LG10', 'conta criada', 'ON06'] },
  { title: 'Cadastro — e-mail vazio', steps: ['CD01', 'Continuar vazio', 'CD07'] },
  { title: 'Cadastro — e-mail inválido', steps: ['CD02', 'e-mail incompleto', 'CD08'] },
  { title: 'Cadastro — e-mail já cadastrado', steps: ['CD02', 'e-mail com conta', 'CD09', 'Entrar', 'LG01'] },
  { title: 'Cadastro — senha fraca', steps: ['CD03', 'senha curta', 'CD10'] },
  { title: 'Cadastro — nome de usuário em uso', steps: ['CD03', 'usuário em uso', 'CD11', 'escolhe uma sugestão', 'CD04'] },
  { title: 'Cadastro — termos não aceitos', steps: ['CD03', 'Criar conta sem aceitar', 'CD12'] },
  { title: 'Cadastro — ler os termos', steps: ['CD03', 'Ler os Termos de uso', 'CD15', 'Voltar', 'CD03'] },
  { title: 'Confirmar e-mail — código errado', steps: ['CD05', 'código errado', 'CD13', 'Reenviar código', 'CD14', 'código certo', 'CD06'] },
  { title: 'Esqueci a senha — caminho principal', steps: ['ES01', 'Esqueci a senha', 'ES02', 'Enviar link', 'ES03', 'abre o link do e-mail', 'ES04', 'Salvar nova senha', 'ES05', 'Entrar', 'LG01'] },
  { title: 'Esqueci a senha — e-mail inválido', steps: ['ES02', 'e-mail incompleto', 'ES06'] },
  { title: 'Esqueci a senha — senhas diferentes', steps: ['ES04', 'confirmação diferente', 'ES07'] },
  { title: 'Esqueci a senha — senha fraca', steps: ['ES04', 'senha curta', 'ES08'] },
  { title: 'Esqueci a senha — link vencido', steps: ['ES03', 'abre um link vencido', 'ES09', 'Pedir novo link', 'ES02'] },
  { title: 'Esqueci a senha — reenviar link', steps: ['ES03', 'Reenviar link', 'ES10'] },
  { title: 'Onboarding — pular perguntas', steps: ['ON06', 'Pular por agora', 'ON14', 'Pular', 'ON13'] },
  { title: 'Onboarding — continuar respondendo', steps: ['ON14', 'Continuar respondendo', 'ON06'] },
  { title: 'Onboarding — voltar uma etapa', steps: ['ON07', 'voltar', 'ON06'] },
  { title: 'Lembretes — agora não', steps: ['ON10', 'Agora não', 'ON12'] },
  { title: 'Notificações — não permitir', steps: ['ON11', 'Não permitir', 'ON12'] },
  { title: 'Sem conexão', steps: ['ON01', 'sem internet', 'EE01', 'Tentar novamente', 'ON01'] },
  { title: 'Erro inesperado', steps: ['LG03', 'erro no servidor', 'EE02', 'Tentar', 'LG03'] },
  { title: 'Sessão expirada', steps: ['HOME', 'sessão vencida', 'EE03', 'Entrar', 'LG01'] },
];
const EDGES = [];
for (const ch of CHAINS) for (let i = 0; i + 2 < ch.steps.length; i += 2) EDGES.push({ from: ch.steps[i], label: ch.steps[i + 1], to: ch.steps[i + 2], chain: ch.title });
const PAGE_OF = {};
for (const p of PAGES) for (const r of p.rows) for (const id of r.ids) PAGE_OF[id] = p.name;

// ---------------------------------------------------------------- page layout helpers (canvas: títulos, notas, setas)
const COL_W = W + 200;          // distância entre telas na linha
const NOTE_H = 150;             // espaço da nota acima da tela
const ROW_H = 60 + NOTE_H + H + 220;
const BADGE = { real: ['success', 'Real'], variacao: ['outline', 'Variação da tela real'], proposta: ['brand', 'Proposta'] };
function topText(text, typo, color, x, y, w) {
  const s = build(T(text, typo, color, w ? { w: w } : {}), null);
  s.x = x; s.y = y;
  return s;
}
function topBoard(spec, x, y) { const s = build(spec, null); s.x = x; s.y = y; return s; }
function arrow(x1, y1, x2, y2, name) {
  const p = penpot.createPath();
  p.name = name || 'Seta';
  const d = 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
  let ok = false;
  try { p.d = d; ok = true; } catch (e) {}
  if (!ok) { try { p.content = d; ok = true; } catch (e) { err('seta', e); } }
  tryDo('seta fills', () => { p.fills = []; });
  tryDo('seta stroke', () => { p.strokes = [stroke('brand', 2, 'center', { strokeCapEnd: 'triangle-arrow' })]; });
  STATS.arrows++;
  return p;
}
function originText(id) {
  const ins = EDGES.filter(e => e.to === id);
  if (!ins.length) return 'Início do fluxo.';
  const seen = {}; const parts = [];
  for (const e of ins) { const k = e.from + e.label; if (seen[k]) continue; seen[k] = 1; parts.push(e.from + ' (' + e.label + ')'); }
  return 'Vem de: ' + parts.join(' · ');
}
function noteSpec(sc) {
  const b = BADGE[sc.status] || BADGE.proposta;
  return F({ name: 'Nota — ' + sc.id, gap: 8, w: W }, [
    C('Badge', { Variant: b[0] }, { name: 'Selo', texts: { Label: b[1] } }),
    T(sc.id + ' · ' + sc.name, 'heading/lg', 'foreground', { name: 'Nome', w: 'fill' }),
    T(originText(sc.id) + (sc.ref ? '\n' + sc.ref : ''), 'body/sm', 'muted-foreground', { name: 'Origem', w: 'fill' })]);
}
function screenSpec(sc) {
  const d = sc.def();
  return SCREEN({ name: sc.id + ' ' + sc.name, p: d.p, gap: d.gap, jc: d.jc, ai: d.ai }, d.kids);
}
function sumStatus(ids) {
  const c = { real: 0, variacao: 0, proposta: 0 };
  for (const id of ids) c[S[id].status]++;
  return ids.length + ' telas · ' + c.real + ' reais · ' + c.variacao + ' variações de telas reais · ' + c.proposta + ' propostas';
}

// ---------------------------------------------------------------- pages
async function newPage(name) {
  const page = penpot.createPage();
  page.name = name;
  await sleep(30);
  await penpot.openPage(page);
  await waitFor(() => penpot.currentPage && penpot.currentPage.id === page.id, 5000);
  tryDo('marcar página', () => page.setSharedPluginData(PD_NS, PD_KEY, '1'));
  tryDo('fundo da página', () => { page.background = '#262626'; });
  STATS.pages++;
  return page;
}
async function buildScreenPage(P) {
  const page = await newPage(P.name);
  SCREEN_SHAPES = {}; NAV.length = 0;
  const all = [].concat(...P.rows.map(r => r.ids));
  topText(P.name, 'display/4xl', 'foreground', 0, 0);
  topText(sumStatus(all), 'body/base', 'muted-foreground', 0, 56, 1400);
  let y = 200;
  for (const r of P.rows) {
    topText(r.title, 'heading/2xl', 'foreground', 0, y);
    topText(r.desc, 'body/base', 'muted-foreground', 0, y + 40, 1600);
    const sy = y + 60 + NOTE_H;
    r.ids.forEach((id, i) => {
      const sc = S[id]; const x = i * COL_W;
      say('Tela ' + id + ' — ' + sc.name);
      try {
        topBoard(noteSpec(sc), x, y + 90);
        const s = topBoard(screenSpec(sc), x, sy);
        SCREEN_SHAPES[id] = s; STATS.screens++;
      } catch (e) { err('tela ' + id, e); }
      PROGRESS.done++;
    });
    // setas entre telas vizinhas ligadas por um fluxo
    for (let i = 0; i + 1 < r.ids.length; i++) {
      const e = EDGES.find(x => x.from === r.ids[i] && x.to === r.ids[i + 1]);
      if (!e) continue;
      const x1 = i * COL_W + W + 24, x2 = (i + 1) * COL_W - 24, ay = sy + H / 2;
      arrow(x1, ay, x2, ay, 'Seta ' + e.from + ' → ' + e.to);
      topText(e.label, 'body/sm-medium', 'brand', x1, ay - 52, x2 - x1);
    }
    y += ROW_H;
    await sleep(10);
  }
  // protótipo: cliques que levam a outra tela da mesma página
  for (const n of NAV) {
    const dest = SCREEN_SHAPES[n.to];
    if (!dest) continue;
    tryDo('interação → ' + n.to, () => { n.shape.addInteraction('click', { type: 'navigate-to', destination: dest }); STATS.interactions++; });
  }
  for (const r of P.rows) {
    const first = SCREEN_SHAPES[r.ids[0]];
    if (first) tryDo('fluxo ' + r.title, () => { page.createFlow(r.title, first); STATS.flows++; });
  }
  return page;
}
async function buildFlowsPage() {
  topText('Fluxos', 'display/4xl', 'foreground', 0, 0);
  topText(CHAINS.length + ' caminhos, com o caminho principal e cada erro ou desvio. Cada caixa é uma tela; o código (ex.: LG02) é o nome da tela nas outras páginas.', 'body/base', 'muted-foreground', 0, 56, 1400);
  const NODE_W = 240, NODE_H = 128, GAP = 170;
  let y = 200;
  for (const ch of CHAINS) {
    topText(ch.title, 'heading/xl', 'foreground', 0, y);
    const ny = y + 48;
    const nodes = ch.steps.filter((_, i) => i % 2 === 0);
    nodes.forEach((id, i) => {
      const sc = S[id]; const b = BADGE[sc.status] || BADGE.proposta;
      const x = i * (NODE_W + GAP);
      tryDo('caixa ' + id, () => topBoard(F({ name: 'Caixa ' + id, w: NODE_W, h: NODE_H, gap: 6, p: 16, fill: 'card', stroke: 'border', r: 12, jc: 'center' }, [
        C('Badge', { Variant: b[0] }, { name: 'Selo', texts: { Label: b[1] } }),
        T(id + ' · ' + sc.name, 'body/sm-medium', 'foreground', { name: 'Tela', w: 'fill' }),
        T(sc.external ? 'Outro arquivo' : 'Página ' + PAGE_OF[id], 'body/xs', 'muted-foreground', { name: 'Página' })]), x, ny));
      if (i + 1 < nodes.length) {
        const x1 = x + NODE_W + 12, x2 = x + NODE_W + GAP - 12, ay = ny + NODE_H / 2;
        arrow(x1, ay, x2, ay, 'Seta ' + id + ' → ' + nodes[i + 1]);
        topText(ch.steps[i * 2 + 1], 'body/xs', 'brand', x1, ay - 44, x2 - x1);
      }
    });
    y += 48 + NODE_H + 90;
    PROGRESS.done++;
    await sleep(5);
  }
}

// ---------------------------------------------------------------- checks, cleanup, run
function fileCheck() {
  const f = penpot.currentFile;
  if (!f) return { ok: false, why: 'Nenhum arquivo aberto.' };
  if (f.name !== FILE_NAME) return { ok: false, why: 'Este plugin só roda no arquivo "' + FILE_NAME + '". O arquivo aberto é "' + f.name + '". Nada foi alterado.' };
  const lib = findLibrary();
  if (!lib) return { ok: false, why: 'A biblioteca "' + LIB_NAME + '" não está conectada a este arquivo. Conecte em Bibliotecas (Alt+L) e abra o plugin de novo. Nada foi alterado.' };
  let n = 0; try { n = (lib.components || []).length; } catch (e) {}
  return { ok: true, name: f.name, lib: lib, comps: n };
}
async function cleanup() {
  const file = penpot.currentFile;
  const pages = (file.pages || []).slice();
  const mine = pages.filter(p => { try { return p.getSharedPluginData(PD_NS, PD_KEY) === '1'; } catch (e) { return false; } });
  const others = pages.filter(p => mine.indexOf(p) < 0);
  // página vazia padrão de arquivo novo ("Page 1" / "Página 1") sem nada dentro: pode sair
  const emptyDefault = others.filter(p => { try { return /^(Page|Página) 1$/.test(p.name) && (p.root.children || []).length === 0; } catch (e) { return false; } });
  return { mine: mine, emptyDefault: emptyDefault, keep: others.length - emptyDefault.length };
}
let running = false;
async function run() {
  if (running) return; running = true;
  const t0 = Date.now();
  for (const k in STATS) STATS[k] = 0;
  for (const k in USED) delete USED[k];
  ERRORS.length = 0; LOG.length = 0;
  try {
    try { penpot.flags.naturalChildOrdering = true; } catch (e) { err('flags', e); }
    const chk = fileCheck();
    if (!chk.ok) { say(chk.why, { finished: true, failed: true }); return; }
    LIB = chk.lib; indexLibrary(LIB);
    const nScreens = Object.values(S).filter(s => !s.external).length;
    PROGRESS = { done: 0, total: nScreens + CHAINS.length };
    say('Biblioteca conectada: ' + LIB.name + ' (' + chk.comps + ' componentes).');
    const old = await cleanup();
    if (old.mine.length) say('Vou substituir ' + old.mine.length + ' páginas feitas antes por este plugin. Outras páginas ficam como estão.');
    const first = await newPage('Fluxos');   // abre uma página nova antes de apagar as antigas
    for (const p of old.mine.concat(old.emptyDefault)) { tryDo('apagar página ' + p.name, () => p.remove()); await sleep(10); }
    // a página "Fluxos" (primeira da lista) recebe o mapa no fim; primeiro as telas
    const firstRef = first;
    for (const P of PAGES) {
      say('Página ' + P.name + '…');
      try { await buildScreenPage(P); } catch (e) { err('página ' + P.name, e); }
    }
    await penpot.openPage(firstRef);
    await waitFor(() => penpot.currentPage && penpot.currentPage.id === firstRef.id, 5000);
    say('Página Fluxos…');
    try { await buildFlowsPage(); } catch (e) { err('página Fluxos', e); }
    const secs = Math.round((Date.now() - t0) / 1000);
    const summary = 'Concluído em ' + secs + ' s. Páginas: ' + STATS.pages + ' · telas: ' + STATS.screens + ' · cópias de componentes: ' + STATS.copies +
      ' · quadros com auto layout: ' + STATS.flexBoards + ' · interações: ' + STATS.interactions + ' · fluxos de protótipo: ' + STATS.flows + ' · setas: ' + STATS.arrows + ' · erros: ' + ERRORS.length;
    say(summary, { finished: true, errors: ERRORS.slice(0, 200), stats: STATS, used: USED });
  } catch (e) {
    err('run', e);
    say('Falhou: ' + (e && e.message ? e.message : e), { finished: true, failed: true, errors: ERRORS.slice(0, 200) });
  } finally { running = false; }
}
penpot.ui.open('Anota Treino — Login + Onboarding', UI_URL, { width: 340, height: 480 });
penpot.ui.onMessage((msg) => {
  if (!msg) return;
  if (msg.type === 'check') {
    const c = fileCheck();
    penpot.ui.sendMessage({ type: 'check', ok: c.ok, why: c.why, name: c.name, comps: c.comps });
  }
  if (msg.type === 'generate') run();
});
