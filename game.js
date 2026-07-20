/* ============================================================
   ROKET RUSH v2 — Subway Surfers tarzı sonsuz uzay koşusu
   Performans stratejisi (değişmedi, hâlâ acımasız):
   - Nesne havuzu: oyun sırasında hiçbir obje yaratılmaz/yok edilmez.
   - Kameranın ARKASINA geçen her obje AYNI KAREDE sahneden alınır.
   - Kısa far plane + sis; gölge yok; low-poly; paylaşılan materyal;
     pixelRatio ≤ 2; HUD saniyede ~10 kez güncellenir.
   Yeni sistemler: temalı bölgeler, lazer kapıları, hareketli kayalar,
   görevler, rütbeler, yakın geçiş bonusu, canlanma, günlük hediye,
   turbo, egzoz izi, kıvılcımlar, prosedürel ses, titreşim.
   ============================================================ */

'use strict';

// ---------- Kayıt ----------
const SAVE_KEY = 'rocketrush_save_v1';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') return Object.assign({ coins: 0, best: 0, owned: [0], selected: 0 }, s);
  } catch (e) {}
  return { coins: 0, best: 0, owned: [0], selected: 0 };
}
const save = loadSave();

// TEST derlemesi: sonsuz para (release APK/AAB'de asla aktif olmaz)
const CHEAT = (typeof AndroidApp !== 'undefined' && (() => { try { return AndroidApp.isCheat(); } catch (e) { return false; } })())
  || /[?&]cheat=1/.test(location.search);
if (CHEAT) save.coins = 99999999;

if (!save.upg) save.upg = {};
for (const k of ['magnet', 'mult', 'shield', 'turbo']) if (!save.upg[k]) save.upg[k] = 0;
if (typeof save.xp !== 'number') save.xp = 0;
if (typeof save.muted !== 'boolean') save.muted = false;
if (typeof save.musicOff !== 'boolean') save.musicOff = false;
if (typeof save.trail !== 'number') save.trail = 0;
if (!Array.isArray(save.trailOwned)) save.trailOwned = [0];
if (!Array.isArray(save.ach)) save.ach = [];
if (!save.stats) save.stats = { runs: 0, coins: 0, dist: 0, near: 0, pu: 0, maxCombo: 0 };
if (typeof save.stats.boss !== 'number') save.stats.boss = 0;
if (typeof save.drone !== 'number') save.drone = -1;
if (!Array.isArray(save.droneOwned)) save.droneOwned = [];
if (!Array.isArray(save.top5)) save.top5 = [];
if (typeof save.campaign !== 'number') save.campaign = 0; // tamamlanan bölüm sayısı
if (typeof save.playCount !== 'number') save.playCount = 0; // toplam koşu (onboarding için)
if (typeof save.inviteCode !== 'string') save.inviteCode = ''; // kendi davet kodu
if (typeof save.referredBy !== 'string') save.referredBy = ''; // kimin kodunu kullandım
if (!Array.isArray(save.refCredited)) save.refCredited = []; // ödüllendirdiğim davetliler
const INVITE_REWARD = 500; // davetliye
const REFERRER_REWARD = 300; // davet edene (her davetli başına)

// ---------- KAMPANYA (hedefli bölümler) ----------
// stat: dist|coins|near|boss|combo  · hedefe ulaşınca bölüm tamamlanır
const CAMPAIGN = [
  { ch: 1, stat: 'dist',  target: 800,   reward: 300,  t: d => 'Reach ' + d + ' m' },
  { ch: 1, stat: 'coins', target: 20,    reward: 300,  t: d => 'Collect ' + d + ' coins in one run' },
  { ch: 1, stat: 'near',  target: 5,     reward: 400,  t: d => 'Make ' + d + ' near misses' },
  { ch: 2, stat: 'dist',  target: 2000,  reward: 600,  t: d => 'Reach ' + d + ' m' },
  { ch: 2, stat: 'combo', target: 4,     reward: 700,  t: d => 'Hit a x' + d + ' combo' },
  { ch: 2, stat: 'boss',  target: 1,     reward: 900,  t: d => 'Defeat ' + d + ' boss' },
  { ch: 3, stat: 'coins', target: 120,   reward: 1000, t: d => 'Collect ' + d + ' coins in one run' },
  { ch: 3, stat: 'dist',  target: 4000,  reward: 1200, t: d => 'Reach ' + d + ' m' },
  { ch: 3, stat: 'near',  target: 25,    reward: 1400, t: d => 'Make ' + d + ' near misses' },
  { ch: 4, stat: 'boss',  target: 3,     reward: 2000, t: d => 'Defeat ' + d + ' bosses' },
  { ch: 4, stat: 'combo', target: 8,     reward: 2200, t: d => 'Hit a x' + d + ' combo' },
  { ch: 4, stat: 'dist',  target: 7000,  reward: 3000, t: d => 'Reach ' + d + ' m' },
];
let campaignRun = -1; // aktif kampanya bölümü (-1 = normal koşu)
let campaignWon = false;
if (typeof save.streak !== 'number') save.streak = 0;
if (typeof save.vibOff !== 'boolean') save.vibOff = false;
if (typeof save.name !== 'string') save.name = '';
if (typeof save.country !== 'string') save.country = '';
if (typeof save.lang !== 'string') save.lang = '';
if (!save.items) save.items = { head: 0, armor: 0, magnet: 0, double: 0 };
if (!save.parts) save.parts = { nose: 0, body: 0, fins: 0, engine: 0, paint: 0 };
if (save.parts.paint === undefined) save.parts.paint = 0;
if (!save.partsOwned) save.partsOwned = { nose: [0], body: [0], fins: [0], engine: [0], paint: [0] };
if (!save.partsOwned.paint) save.partsOwned.paint = [0];
if (typeof save.tutorialDone !== 'boolean') save.tutorialDone = false;
if (typeof save.boxRuns !== 'number') save.boxRuns = 0;
if (typeof save.box !== 'boolean') save.box = false;

// ---------- Dopamin ayarları ----------
// Günlük seri ödülleri: her gün üst üste girince büyür, gün kaçırınca başa döner
const STREAK_REWARDS = [250, 350, 500, 650, 800, 1000, 1500];
// Lucky Box: 3 koşuda bir kazanılır, ödül değişken (değişken oran = en güçlü kanca)
const BOX_EVERY = 3;
function rollLuckyBox() {
  const r = Math.random();
  if (r < 0.005) return 10000;                                // JACKPOT %0,5
  if (r < 0.05) return 2500;                                  // büyük ödül %4,5
  if (r < 0.20) return 700 + Math.floor(Math.random() * 800); // %15
  if (r < 0.50) return 300 + Math.floor(Math.random() * 400); // %30
  return 100 + Math.floor(Math.random() * 200);               // %50
}

// ---------- SEZON PASS ----------
const SEASON_EPOCH = Date.UTC(2026, 0, 5);
const SEASON_DAYS = 30;
const SP_TIERS = 30;
const PASS_PREMIUM_COST = 10000;
function currentSeasonId() { return Math.max(0, Math.floor((Date.now() - SEASON_EPOCH) / (SEASON_DAYS * 864e5))); }
function seasonDaysLeft() {
  const end = SEASON_EPOCH + (currentSeasonId() + 1) * SEASON_DAYS * 864e5;
  return Math.max(0, Math.ceil((end - Date.now()) / 864e5));
}
// kademe maliyetleri (SP) ve kümülatif toplamları
const TIER_CUM = [];
{ let c = 0; for (let i = 0; i < SP_TIERS; i++) { c += 150 + i * 20; TIER_CUM.push(c); } }
function tierRewards(i) {
  const t = i + 1;
  let f = { coins: 100 + i * 20 };
  let p = { coins: 250 + i * 45 };
  if (t % 5 === 0) f = { coins: 300 + i * 30 };
  if (t === 10) p = { trail: 6 };   // Nova izi (sezonluk)
  if (t === 20) p = { drone: 4 };   // Starry dron (sezonluk)
  if (t === 30) { f = { coins: 2000 }; p = { rocket: 7 }; } // Comet roketi (sezonluk)
  return { f, p };
}
function rewardLabel(r) {
  if (r.coins) return '🪙 ' + fmt(r.coins);
  if (r.trail !== undefined) return '🌈 Nova';
  if (r.drone !== undefined) return '⭐ Starry';
  return '☄️ Comet';
}
function grantReward(r) {
  if (r.coins) save.coins += r.coins;
  if (r.trail !== undefined && !save.trailOwned.includes(r.trail)) save.trailOwned.push(r.trail);
  if (r.drone !== undefined && !save.droneOwned.includes(r.drone)) save.droneOwned.push(r.drone);
  if (r.rocket !== undefined && !save.owned.includes(r.rocket)) save.owned.push(r.rocket);
}
// sezon değiştiyse ilerlemeyi sıfırla
function ensureSeason() {
  const id = currentSeasonId();
  if (!save.season || save.season.id !== id) {
    save.season = { id: id, sp: 0, cf: [], cp: [], premium: false };
    persist();
  }
}
ensureSeason();

// ---------- ÇOK DİLLİLİK (endonim adlarıyla) ----------
const LANGS = {
  en: { name: 'ENGLISH', d: {} },
  tr: { name: 'TÜRKÇE', d: { play:'OYNA', garage:'GARAJ', season:'SEZON KARTI', multi:'ÇOK OYUNCULU', settings:'AYARLAR', missions:'GÖREVLER', best:'REKOR', coins:'ALTIN', gameover:'OYUN BİTTİ', score:'Skor', dist:'Mesafe', collected:'Toplanan', near:'Yakın geçiş', again:'TEKRAR OYNA', mainmenu:'ANA MENÜ', share:'SKORU PAYLAŞ', continueq:'DEVAM ET?', revive:'CANLAN', giveup:'VAZGEÇ', watchad:'REKLAM İZLE · BEDAVA', luckybox:'ŞANS KUTUSU', openbox:'ŞANS KUTUSUNU AÇ', claim:'AL', sound:'Ses efektleri', music:'Müzik', vib:'Titreşim', tutorial:'Eğitim', reset:'İlerlemeyi sıfırla', lang:'Dil', feedback:'Öneri & Hata bildir', profile:'Profil', powerups:'GÜÇLENDİRMELER', trails:'EGZOZ İZLERİ', drones:'DRONLAR', boosters:'TEK KULLANIMLIK', stats:'İSTATİSTİK', ach:'BAŞARIMLAR', select:'SEÇ', selected:'SEÇİLİ', equip:'TAK', equipped:'TAKILI', buy:'SATIN AL', use:'Kullanılsın mı?', start:'BAŞLA', lead:'SKOR TABLOSU', world:'DÜNYA', country:'ÜLKE', daily:'GÜNLÜK', weekly:'HAFTALIK', you:'SEN', quick:'HIZLI MAÇ', airivals:'7 yapay zekâ rakibe karşı — son ölen kazanır!', online_soon:'Çevrimiçi odalar yakında', finding:'Pilotlar aranıyor…', winner:'KAZANDIN!', eliminated:'ELENDİN', place:'Sıra', alive:'hayatta', newrecord:'YENİ REKOR!', soclose:'ÇOK YAKINDI!', boss_in:'BOSS GELİYOR!', boss_out:'BOSS YENİLDİ!', meteor:'METEOR YAĞMURU!', coinrush:'ALTIN YAĞMURU!', nameq:'PİLOT ADINI SEÇ', flagq:'Ülkeni seç', lab:'ROKET LABORATUVARI', build:'KENDİ ROKETİNİ YAP', createroom:'ODA OLUŞTUR', joinroom:'ODAYA KATIL', roomcode:'ODA KODU', waiting:'Ev sahibi bekleniyor…', roomnf:'Oda bulunamadı', enter:'GİR', startrace:'YARIŞI BAŞLAT', campaign:'GÖREVLER', leveldone:'BÖLÜM TAMAM!', invite:'Arkadaş Davet Et', rate:'Bizi Değerlendir', yourcode:'Senin davet kodun', entercode:'Arkadaşının kodunu gir', redeem:'KULLAN', invited:'Davet ödülü alındı!', offhint:'📴 Çevrimdışısın — skorun ve ilerlemen kaydedilmiyor. İnternete bağlan!', codeused:'Zaten bir davet kullandın', codeself:'Kendi kodunu kullanamazsın', codenf:'Kod bulunamadı', chapter:'Bölüm', level:'Görev', locked:'🔒 KİLİTLİ', complete:'✓ TAMAM', gift:'Günlük Seri', firstrun:'GÜNÜN İLK KOŞUSU: 2X ALTIN!', armorbrk:'Zırh kırıldı!', nearmiss:'Yakın geçiş!', hint:'← Kaydır → şerit değiştir | ↑ yüksel | ↓ alçal', premium:'PREMIUM AÇ', daysleft:'gün kaldı', tier:'Kademe' } },
  az: { name: 'AZƏRBAYCANCA', d: { play:'OYNA', garage:'QARAJ', season:'MÖVSÜM KARTI', multi:'ÇOX OYUNÇULU', settings:'AYARLAR', missions:'TAPŞIRIQLAR', best:'REKORD', coins:'QIZIL', gameover:'OYUN BİTDİ', score:'Xal', dist:'Məsafə', collected:'Toplanan', near:'Yaxın keçid', again:'YENİDƏN OYNA', mainmenu:'ANA MENYU', share:'XALI PAYLAŞ', continueq:'DAVAM EDİLSİN?', revive:'DİRİL', giveup:'İMTİNA', watchad:'REKLAMA BAX · PULSUZ', luckybox:'ŞANS QUTUSU', openbox:'ŞANS QUTUSUNU AÇ', claim:'GÖTÜR', sound:'Səs effektləri', music:'Musiqi', vib:'Vibrasiya', tutorial:'Təlim', reset:'İrəliləyişi sıfırla', lang:'Dil', feedback:'Təklif & Xəta bildir', profile:'Profil', powerups:'GÜCLƏNDİRİCİLƏR', trails:'İZLƏR', drones:'DRONLAR', boosters:'BİRDƏFƏLİK', stats:'STATİSTİKA', ach:'NAİLİYYƏTLƏR', select:'SEÇ', selected:'SEÇİLİB', equip:'TAX', equipped:'TAXILIB', buy:'AL', use:'İstifadə edilsin?', start:'BAŞLA', lead:'REYTİNQ', world:'DÜNYA', country:'ÖLKƏ', you:'SƏN', quick:'SÜRƏTLİ MATÇ', airivals:'7 süni intellekt rəqibinə qarşı — son ölən qazanır!', online_soon:'Onlayn otaqlar tezliklə', finding:'Pilotlar axtarılır…', winner:'QAZANDIN!', eliminated:'ELİMİNASİYA', place:'Yer', alive:'sağ', newrecord:'YENİ REKORD!', soclose:'ÇOX YAXIN İDİ!', boss_in:'BOSS GƏLİR!', boss_out:'BOSS MƏĞLUB!', meteor:'METEOR YAĞIŞI!', coinrush:'QIZIL YAĞIŞI!', nameq:'PİLOT ADINI SEÇ', flagq:'Ölkəni seç', gift:'Günlük Seriya', firstrun:'GÜNÜN İLK QAÇIŞI: 2X QIZIL!', armorbrk:'Zireh qırıldı!', nearmiss:'Yaxın keçid!', hint:'← Sürüşdür → zolaq dəyiş | ↑ qalx | ↓ en', premium:'PREMIUM AÇ', daysleft:'gün qalıb', tier:'Səviyyə' } },
  es: { name: 'ESPAÑOL', d: { play:'JUGAR', garage:'GARAJE', season:'PASE DE TEMPORADA', multi:'MULTIJUGADOR', settings:'AJUSTES', missions:'MISIONES', best:'RÉCORD', coins:'MONEDAS', gameover:'FIN DEL JUEGO', score:'Puntos', dist:'Distancia', collected:'Recogido', near:'Roces', again:'JUGAR OTRA VEZ', mainmenu:'MENÚ', share:'COMPARTIR', continueq:'¿CONTINUAR?', revive:'REVIVIR', giveup:'RENDIRSE', watchad:'VER ANUNCIO · GRATIS', luckybox:'CAJA DE LA SUERTE', openbox:'ABRIR CAJA', claim:'RECLAMAR', sound:'Efectos de sonido', music:'Música', vib:'Vibración', tutorial:'Tutorial', reset:'Reiniciar progreso', lang:'Idioma', feedback:'Sugerencias y errores', profile:'Perfil', powerups:'POTENCIADORES', trails:'ESTELAS', drones:'DRONES', boosters:'DE UN SOLO USO', stats:'ESTADÍSTICAS', ach:'LOGROS', select:'ELEGIR', selected:'ELEGIDO', equip:'EQUIPAR', equipped:'EQUIPADO', buy:'COMPRAR', use:'¿Usar?', start:'EMPEZAR', lead:'CLASIFICACIÓN', world:'MUNDO', country:'PAÍS', you:'TÚ', quick:'PARTIDA RÁPIDA', airivals:'Contra 7 rivales IA: ¡el último vivo gana!', online_soon:'Salas online próximamente', finding:'Buscando pilotos…', winner:'¡GANASTE!', eliminated:'ELIMINADO', place:'Puesto', alive:'vivos', newrecord:'¡NUEVO RÉCORD!', soclose:'¡CASI!', boss_in:'¡VIENE EL JEFE!', boss_out:'¡JEFE DERROTADO!', meteor:'¡LLUVIA DE METEOROS!', coinrush:'¡LLUVIA DE MONEDAS!', nameq:'ELIGE TU NOMBRE', flagq:'Elige tu país', gift:'Racha diaria', firstrun:'¡PRIMERA CARRERA: MONEDAS X2!', armorbrk:'¡Blindaje roto!', nearmiss:'¡Por poco!', hint:'← Desliza → cambia carril | ↑ sube | ↓ baja', premium:'DESBLOQUEAR PREMIUM', daysleft:'días restantes', tier:'Nivel' } },
  pt: { name: 'PORTUGUÊS', d: { play:'JOGAR', garage:'GARAGEM', season:'PASSE DE TEMPORADA', multi:'MULTIJOGADOR', settings:'OPÇÕES', missions:'MISSÕES', best:'RECORDE', coins:'MOEDAS', gameover:'FIM DE JOGO', score:'Pontos', dist:'Distância', collected:'Coletado', near:'Quase-acidentes', again:'JOGAR DE NOVO', mainmenu:'MENU', share:'COMPARTILHAR', continueq:'CONTINUAR?', revive:'REVIVER', giveup:'DESISTIR', watchad:'VER ANÚNCIO · GRÁTIS', luckybox:'CAIXA DA SORTE', openbox:'ABRIR CAIXA', claim:'RESGATAR', sound:'Efeitos sonoros', music:'Música', vib:'Vibração', tutorial:'Tutorial', reset:'Zerar progresso', lang:'Idioma', feedback:'Sugestões e bugs', profile:'Perfil', powerups:'POWER-UPS', trails:'RASTROS', drones:'DRONES', boosters:'USO ÚNICO', stats:'ESTATÍSTICAS', ach:'CONQUISTAS', select:'ESCOLHER', selected:'ESCOLHIDO', equip:'EQUIPAR', equipped:'EQUIPADO', buy:'COMPRAR', use:'Usar?', start:'COMEÇAR', lead:'RANKING', world:'MUNDO', country:'PAÍS', you:'VOCÊ', quick:'PARTIDA RÁPIDA', airivals:'Contra 7 rivais IA: o último vivo vence!', online_soon:'Salas online em breve', finding:'Procurando pilotos…', winner:'VENCEU!', eliminated:'ELIMINADO', place:'Posição', alive:'vivos', newrecord:'NOVO RECORDE!', soclose:'QUASE!', boss_in:'CHEFE CHEGANDO!', boss_out:'CHEFE DERROTADO!', meteor:'CHUVA DE METEOROS!', coinrush:'CHUVA DE MOEDAS!', nameq:'ESCOLHA SEU NOME', flagq:'Escolha seu país', gift:'Sequência diária', firstrun:'PRIMEIRA CORRIDA: MOEDAS 2X!', armorbrk:'Blindagem quebrada!', nearmiss:'Por pouco!', hint:'← Deslize → muda faixa | ↑ sobe | ↓ desce', premium:'DESBLOQUEAR PREMIUM', daysleft:'dias restantes', tier:'Nível' } },
  fr: { name: 'FRANÇAIS', d: { play:'JOUER', garage:'GARAGE', season:'PASS DE SAISON', multi:'MULTIJOUEUR', settings:'RÉGLAGES', missions:'MISSIONS', best:'RECORD', coins:'PIÈCES', gameover:'PARTIE TERMINÉE', score:'Score', dist:'Distance', collected:'Ramassé', near:'Frôlements', again:'REJOUER', mainmenu:'MENU', share:'PARTAGER', continueq:'CONTINUER ?', revive:'REVIVRE', giveup:'ABANDONNER', watchad:'VOIR PUB · GRATUIT', luckybox:'BOÎTE CHANCE', openbox:'OUVRIR LA BOÎTE', claim:'RÉCUPÉRER', sound:'Effets sonores', music:'Musique', vib:'Vibration', tutorial:'Tutoriel', reset:'Réinitialiser', lang:'Langue', feedback:'Suggestions & bugs', profile:'Profil', powerups:'BONUS', trails:'TRAÎNÉES', drones:'DRONES', boosters:'USAGE UNIQUE', stats:'STATISTIQUES', ach:'SUCCÈS', select:'CHOISIR', selected:'CHOISI', equip:'ÉQUIPER', equipped:'ÉQUIPÉ', buy:'ACHETER', use:'Utiliser ?', start:'DÉMARRER', lead:'CLASSEMENT', world:'MONDE', country:'PAYS', you:'TOI', quick:'PARTIE RAPIDE', airivals:'Contre 7 rivaux IA : le dernier vivant gagne !', online_soon:'Salons en ligne bientôt', finding:'Recherche de pilotes…', winner:'VICTOIRE !', eliminated:'ÉLIMINÉ', place:'Place', alive:'en vie', newrecord:'NOUVEAU RECORD !', soclose:'SI PRÈS !', boss_in:'BOSS EN VUE !', boss_out:'BOSS VAINCU !', meteor:'PLUIE DE MÉTÉORES !', coinrush:'PLUIE DE PIÈCES !', nameq:'CHOISIS TON NOM', flagq:'Choisis ton pays', gift:'Série quotidienne', firstrun:'1RE COURSE DU JOUR : PIÈCES X2 !', armorbrk:'Blindage brisé !', nearmiss:'De justesse !', hint:'← Glisse → change de voie | ↑ monte | ↓ descend', premium:'DÉBLOQUER PREMIUM', daysleft:'jours restants', tier:'Palier' } },
  de: { name: 'DEUTSCH', d: { play:'SPIELEN', garage:'GARAGE', season:'SEASON PASS', multi:'MEHRSPIELER', settings:'EINSTELLUNGEN', missions:'MISSIONEN', best:'REKORD', coins:'MÜNZEN', gameover:'SPIEL VORBEI', score:'Punkte', dist:'Distanz', collected:'Gesammelt', near:'Beinahe-Crashs', again:'NOCHMAL', mainmenu:'MENÜ', share:'TEILEN', continueq:'WEITERMACHEN?', revive:'WIEDERBELEBEN', giveup:'AUFGEBEN', watchad:'WERBUNG · GRATIS', luckybox:'GLÜCKSBOX', openbox:'BOX ÖFFNEN', claim:'ABHOLEN', sound:'Soundeffekte', music:'Musik', vib:'Vibration', tutorial:'Tutorial', reset:'Fortschritt löschen', lang:'Sprache', feedback:'Feedback & Bugs', profile:'Profil', powerups:'POWER-UPS', trails:'SPUREN', drones:'DROHNEN', boosters:'EINMALIG', stats:'STATISTIK', ach:'ERFOLGE', select:'WÄHLEN', selected:'GEWÄHLT', equip:'AUSRÜSTEN', equipped:'AUSGERÜSTET', buy:'KAUFEN', use:'Benutzen?', start:'START', lead:'RANGLISTE', world:'WELT', country:'LAND', you:'DU', quick:'SCHNELLES MATCH', airivals:'Gegen 7 KI-Rivalen — der Letzte gewinnt!', online_soon:'Online-Räume bald', finding:'Suche Piloten…', winner:'GEWONNEN!', eliminated:'AUSGESCHIEDEN', place:'Platz', alive:'am Leben', newrecord:'NEUER REKORD!', soclose:'SO KNAPP!', boss_in:'BOSS KOMMT!', boss_out:'BOSS BESIEGT!', meteor:'METEORSCHAUER!', coinrush:'MÜNZREGEN!', nameq:'WÄHLE DEINEN NAMEN', flagq:'Wähle dein Land', gift:'Tägliche Serie', firstrun:'ERSTER LAUF: MÜNZEN X2!', armorbrk:'Panzerung zerstört!', nearmiss:'Knapp!', hint:'← Wischen → Spur wechseln | ↑ hoch | ↓ runter', premium:'PREMIUM FREISCHALTEN', daysleft:'Tage übrig', tier:'Stufe' } },
  it: { name: 'ITALIANO', d: { play:'GIOCA', garage:'GARAGE', season:'PASS STAGIONE', multi:'MULTIGIOCATORE', settings:'IMPOSTAZIONI', missions:'MISSIONI', best:'RECORD', coins:'MONETE', gameover:'GAME OVER', score:'Punti', dist:'Distanza', collected:'Raccolto', near:'Sfiorati', again:'RIGIOCA', mainmenu:'MENU', share:'CONDIVIDI', continueq:'CONTINUARE?', revive:'RINASCI', giveup:'RINUNCIA', watchad:'GUARDA SPOT · GRATIS', luckybox:'SCATOLA FORTUNATA', openbox:'APRI SCATOLA', claim:'RITIRA', sound:'Effetti sonori', music:'Musica', vib:'Vibrazione', tutorial:'Tutorial', reset:'Azzera progressi', lang:'Lingua', feedback:'Suggerimenti e bug', profile:'Profilo', powerups:'POTENZIAMENTI', trails:'SCIE', drones:'DRONI', boosters:'MONOUSO', stats:'STATISTICHE', ach:'OBIETTIVI', select:'SCEGLI', selected:'SCELTO', equip:'EQUIPAGGIA', equipped:'EQUIPAGGIATO', buy:'COMPRA', use:'Usare?', start:'VIA', lead:'CLASSIFICA', world:'MONDO', country:'PAESE', you:'TU', quick:'PARTITA RAPIDA', airivals:'Contro 7 rivali IA: vince l\'ultimo vivo!', online_soon:'Stanze online in arrivo', finding:'Cerco piloti…', winner:'HAI VINTO!', eliminated:'ELIMINATO', place:'Posto', alive:'vivi', newrecord:'NUOVO RECORD!', soclose:'CI SEI QUASI!', boss_in:'ARRIVA IL BOSS!', boss_out:'BOSS SCONFITTO!', meteor:'PIOGGIA DI METEORE!', coinrush:'PIOGGIA DI MONETE!', nameq:'SCEGLI IL NOME', flagq:'Scegli il paese', gift:'Serie giornaliera', firstrun:'PRIMA CORSA: MONETE X2!', armorbrk:'Corazza rotta!', nearmiss:'Per un pelo!', hint:'← Scorri → cambia corsia | ↑ sali | ↓ scendi', premium:'SBLOCCA PREMIUM', daysleft:'giorni rimasti', tier:'Livello' } },
  ru: { name: 'РУССКИЙ', d: { play:'ИГРАТЬ', garage:'ГАРАЖ', season:'СЕЗОННЫЙ ПРОПУСК', multi:'МУЛЬТИПЛЕЕР', settings:'НАСТРОЙКИ', missions:'ЗАДАНИЯ', best:'РЕКОРД', coins:'МОНЕТЫ', gameover:'ИГРА ОКОНЧЕНА', score:'Очки', dist:'Дистанция', collected:'Собрано', near:'Рядом', again:'ЕЩЁ РАЗ', mainmenu:'МЕНЮ', share:'ПОДЕЛИТЬСЯ', continueq:'ПРОДОЛЖИТЬ?', revive:'ВОЗРОДИТЬСЯ', giveup:'СДАТЬСЯ', watchad:'РЕКЛАМА · БЕСПЛАТНО', luckybox:'КОРОБКА УДАЧИ', openbox:'ОТКРЫТЬ КОРОБКУ', claim:'ЗАБРАТЬ', sound:'Звуки', music:'Музыка', vib:'Вибрация', tutorial:'Обучение', reset:'Сбросить прогресс', lang:'Язык', feedback:'Отзывы и баги', profile:'Профиль', powerups:'УСИЛЕНИЯ', trails:'СЛЕДЫ', drones:'ДРОНЫ', boosters:'ОДНОРАЗОВЫЕ', stats:'СТАТИСТИКА', ach:'ДОСТИЖЕНИЯ', select:'ВЫБРАТЬ', selected:'ВЫБРАНО', equip:'НАДЕТЬ', equipped:'НАДЕТО', buy:'КУПИТЬ', use:'Использовать?', start:'СТАРТ', lead:'РЕЙТИНГ', world:'МИР', country:'СТРАНА', you:'ТЫ', quick:'БЫСТРЫЙ МАТЧ', airivals:'Против 7 ИИ-соперников — победит последний живой!', online_soon:'Онлайн-комнаты скоро', finding:'Поиск пилотов…', winner:'ПОБЕДА!', eliminated:'ВЫБЫЛ', place:'Место', alive:'живы', newrecord:'НОВЫЙ РЕКОРД!', soclose:'ПОЧТИ!', boss_in:'БОСС ИДЁТ!', boss_out:'БОСС ПОВЕРЖЕН!', meteor:'МЕТЕОРИТНЫЙ ДОЖДЬ!', coinrush:'ДОЖДЬ МОНЕТ!', nameq:'ВЫБЕРИ ИМЯ', flagq:'Выбери страну', gift:'Ежедневная серия', firstrun:'ПЕРВЫЙ ЗАБЕГ: МОНЕТЫ X2!', armorbrk:'Броня сломана!', nearmiss:'Едва не задел!', hint:'← Свайп → смена полосы | ↑ вверх | ↓ вниз', premium:'ОТКРЫТЬ ПРЕМИУМ', daysleft:'дней осталось', tier:'Уровень' } },
  ar: { name: 'العربية', d: { play:'العب', garage:'المرآب', season:'بطاقة الموسم', multi:'لعب جماعي', settings:'الإعدادات', missions:'المهام', best:'الرقم القياسي', coins:'العملات', gameover:'انتهت اللعبة', score:'النقاط', dist:'المسافة', collected:'المجموع', near:'مرور قريب', again:'العب مجددًا', mainmenu:'القائمة', share:'مشاركة', continueq:'متابعة؟', revive:'إحياء', giveup:'استسلام', watchad:'شاهد إعلانًا · مجانًا', luckybox:'صندوق الحظ', openbox:'افتح الصندوق', claim:'استلام', sound:'المؤثرات الصوتية', music:'الموسيقى', vib:'الاهتزاز', tutorial:'الشرح', reset:'إعادة التقدم', lang:'اللغة', feedback:'اقتراحات وأخطاء', profile:'الملف الشخصي', powerups:'التعزيزات', trails:'الآثار', drones:'الطائرات', boosters:'استخدام واحد', stats:'الإحصائيات', ach:'الإنجازات', select:'اختر', selected:'مختار', equip:'جهّز', equipped:'مجهز', buy:'اشترِ', use:'استخدام؟', start:'ابدأ', lead:'الترتيب', world:'العالم', country:'الدولة', you:'أنت', quick:'مباراة سريعة', airivals:'ضد 7 خصوم ذكاء اصطناعي — آخر من يبقى يفوز!', online_soon:'الغرف عبر الإنترنت قريبًا', finding:'جارٍ البحث عن طيارين…', winner:'فزت!', eliminated:'أُقصيت', place:'المركز', alive:'أحياء', newrecord:'رقم قياسي جديد!', soclose:'قريب جدًا!', boss_in:'الزعيم قادم!', boss_out:'هُزم الزعيم!', meteor:'وابل النيازك!', coinrush:'مطر العملات!', nameq:'اختر اسمك', flagq:'اختر دولتك', gift:'سلسلة يومية', firstrun:'أول سباق اليوم: عملات ×2!', armorbrk:'تحطم الدرع!', nearmiss:'نجاة بأعجوبة!', hint:'← اسحب → غيّر المسار | ↑ ارتفع | ↓ انخفض', premium:'افتح بريميوم', daysleft:'أيام متبقية', tier:'مستوى' } },
  hi: { name: 'हिन्दी', d: { play:'खेलें', garage:'गैराज', season:'सीज़न पास', multi:'मल्टीप्लेयर', settings:'सेटिंग्स', missions:'मिशन', best:'रिकॉर्ड', coins:'सिक्के', gameover:'खेल समाप्त', score:'स्कोर', dist:'दूरी', collected:'एकत्रित', near:'नज़दीकी बचाव', again:'फिर खेलें', mainmenu:'मुख्य मेनू', share:'साझा करें', continueq:'जारी रखें?', revive:'पुनर्जीवित', giveup:'हार मानें', watchad:'विज्ञापन देखें · मुफ़्त', luckybox:'लकी बॉक्स', openbox:'बॉक्स खोलें', claim:'प्राप्त करें', sound:'ध्वनि प्रभाव', music:'संगीत', vib:'कंपन', tutorial:'ट्यूटोरियल', reset:'प्रगति रीसेट', lang:'भाषा', feedback:'सुझाव और बग', profile:'प्रोफ़ाइल', powerups:'पावर-अप', trails:'ट्रेल्स', drones:'ड्रोन', boosters:'एक बार उपयोग', stats:'आँकड़े', ach:'उपलब्धियाँ', select:'चुनें', selected:'चुना गया', equip:'लगाएँ', equipped:'लगा हुआ', buy:'खरीदें', use:'उपयोग करें?', start:'शुरू', lead:'लीडरबोर्ड', world:'विश्व', country:'देश', you:'आप', quick:'क्विक मैच', airivals:'7 AI प्रतिद्वंद्वियों के विरुद्ध — अंतिम जीवित जीतता है!', online_soon:'ऑनलाइन रूम जल्द ही', finding:'पायलट खोजे जा रहे हैं…', winner:'आप जीते!', eliminated:'बाहर', place:'स्थान', alive:'जीवित', newrecord:'नया रिकॉर्ड!', soclose:'बहुत करीब!', boss_in:'बॉस आ रहा है!', boss_out:'बॉस हारा!', meteor:'उल्का वर्षा!', coinrush:'सिक्कों की बारिश!', nameq:'अपना नाम चुनें', flagq:'अपना देश चुनें', gift:'दैनिक श्रृंखला', firstrun:'आज की पहली दौड़: सिक्के 2X!', armorbrk:'कवच टूटा!', nearmiss:'बाल-बाल बचे!', hint:'← स्वाइप → लेन बदलें | ↑ ऊपर | ↓ नीचे', premium:'प्रीमियम खोलें', daysleft:'दिन शेष', tier:'स्तर' } },
  id: { name: 'BAHASA INDONESIA', d: { play:'MAIN', garage:'GARASI', season:'SEASON PASS', multi:'MULTIPLAYER', settings:'PENGATURAN', missions:'MISI', best:'REKOR', coins:'KOIN', gameover:'PERMAINAN USAI', score:'Skor', dist:'Jarak', collected:'Terkumpul', near:'Nyaris', again:'MAIN LAGI', mainmenu:'MENU', share:'BAGIKAN', continueq:'LANJUT?', revive:'HIDUPKAN', giveup:'MENYERAH', watchad:'TONTON IKLAN · GRATIS', luckybox:'KOTAK KEBERUNTUNGAN', openbox:'BUKA KOTAK', claim:'AMBIL', sound:'Efek suara', music:'Musik', vib:'Getaran', tutorial:'Tutorial', reset:'Reset kemajuan', lang:'Bahasa', feedback:'Saran & bug', profile:'Profil', powerups:'POWER-UP', trails:'JEJAK', drones:'DRONE', boosters:'SEKALI PAKAI', stats:'STATISTIK', ach:'PENCAPAIAN', select:'PILIH', selected:'DIPILIH', equip:'PAKAI', equipped:'DIPAKAI', buy:'BELI', use:'Gunakan?', start:'MULAI', lead:'PAPAN PERINGKAT', world:'DUNIA', country:'NEGARA', you:'KAMU', quick:'MATCH CEPAT', airivals:'Lawan 7 rival AI — yang terakhir hidup menang!', online_soon:'Room online segera', finding:'Mencari pilot…', winner:'MENANG!', eliminated:'TERSINGKIR', place:'Posisi', alive:'hidup', newrecord:'REKOR BARU!', soclose:'HAMPIR!', boss_in:'BOS DATANG!', boss_out:'BOS KALAH!', meteor:'HUJAN METEOR!', coinrush:'HUJAN KOIN!', nameq:'PILIH NAMAMU', flagq:'Pilih negaramu', gift:'Runtunan harian', firstrun:'LARI PERTAMA: KOIN 2X!', armorbrk:'Pelindung pecah!', nearmiss:'Nyaris!', hint:'← Geser → ganti jalur | ↑ naik | ↓ turun', premium:'BUKA PREMIUM', daysleft:'hari tersisa', tier:'Tingkat' } },
  zh: { name: '中文', d: { play:'开始', garage:'车库', season:'赛季通行证', multi:'多人对战', settings:'设置', missions:'任务', best:'纪录', coins:'金币', gameover:'游戏结束', score:'分数', dist:'距离', collected:'收集', near:'惊险擦过', again:'再来一局', mainmenu:'主菜单', share:'分享', continueq:'继续?', revive:'复活', giveup:'放弃', watchad:'看广告 · 免费', luckybox:'幸运宝箱', openbox:'打开宝箱', claim:'领取', sound:'音效', music:'音乐', vib:'震动', tutorial:'教程', reset:'重置进度', lang:'语言', feedback:'建议与错误反馈', profile:'个人资料', powerups:'强化道具', trails:'尾焰', drones:'无人机', boosters:'一次性道具', stats:'统计', ach:'成就', select:'选择', selected:'已选', equip:'装备', equipped:'已装备', buy:'购买', use:'使用?', start:'开始', lead:'排行榜', world:'世界', country:'国家', you:'你', quick:'快速匹配', airivals:'对战7名AI对手——活到最后者获胜!', online_soon:'在线房间即将推出', finding:'正在寻找飞行员…', winner:'胜利!', eliminated:'淘汰', place:'名次', alive:'存活', newrecord:'新纪录!', soclose:'就差一点!', boss_in:'BOSS来袭!', boss_out:'BOSS被击败!', meteor:'流星雨!', coinrush:'金币雨!', nameq:'选择你的名字', flagq:'选择你的国家', gift:'每日连击', firstrun:'今日首跑: 金币X2!', armorbrk:'护甲破碎!', nearmiss:'好险!', hint:'← 滑动 → 换道 | ↑ 上升 | ↓ 下降', premium:'解锁高级版', daysleft:'天剩余', tier:'等级' } },
  ja: { name: '日本語', d: { play:'プレイ', garage:'ガレージ', season:'シーズンパス', multi:'マルチプレイ', settings:'設定', missions:'ミッション', best:'記録', coins:'コイン', gameover:'ゲームオーバー', score:'スコア', dist:'距離', collected:'獲得', near:'ニアミス', again:'もう一度', mainmenu:'メニュー', share:'シェア', continueq:'続ける?', revive:'復活', giveup:'あきらめる', watchad:'広告を見る · 無料', luckybox:'ラッキーボックス', openbox:'ボックスを開く', claim:'受け取る', sound:'効果音', music:'音楽', vib:'バイブ', tutorial:'チュートリアル', reset:'進行度リセット', lang:'言語', feedback:'ご意見・バグ報告', profile:'プロフィール', powerups:'パワーアップ', trails:'軌跡', drones:'ドローン', boosters:'使い切り', stats:'統計', ach:'実績', select:'選択', selected:'選択中', equip:'装備', equipped:'装備中', buy:'購入', use:'使う?', start:'スタート', lead:'ランキング', world:'世界', country:'国', you:'あなた', quick:'クイックマッチ', airivals:'AIライバル7人と対戦 — 最後まで生き残れ!', online_soon:'オンラインルームは近日公開', finding:'パイロットを検索中…', winner:'勝利!', eliminated:'脱落', place:'順位', alive:'生存', newrecord:'新記録!', soclose:'あと少し!', boss_in:'ボス出現!', boss_out:'ボス撃破!', meteor:'流星群!', coinrush:'コインラッシュ!', nameq:'名前を選ぼう', flagq:'国を選ぼう', gift:'デイリー連続', firstrun:'本日初ラン: コイン2倍!', armorbrk:'アーマー破損!', nearmiss:'ニアミス!', hint:'← スワイプ → レーン変更 | ↑ 上昇 | ↓ 下降', premium:'プレミアム解放', daysleft:'日残り', tier:'ティア' } },
  ko: { name: '한국어', d: { play:'플레이', garage:'차고', season:'시즌 패스', multi:'멀티플레이', settings:'설정', missions:'미션', best:'기록', coins:'코인', gameover:'게임 오버', score:'점수', dist:'거리', collected:'획득', near:'아슬아슬', again:'다시 하기', mainmenu:'메인 메뉴', share:'공유', continueq:'계속할까요?', revive:'부활', giveup:'포기', watchad:'광고 보기 · 무료', luckybox:'행운 상자', openbox:'상자 열기', claim:'받기', sound:'효과음', music:'음악', vib:'진동', tutorial:'튜토리얼', reset:'진행 초기화', lang:'언어', feedback:'제안 & 버그 신고', profile:'프로필', powerups:'파워업', trails:'궤적', drones:'드론', boosters:'일회용', stats:'통계', ach:'업적', select:'선택', selected:'선택됨', equip:'장착', equipped:'장착됨', buy:'구매', use:'사용할까요?', start:'시작', lead:'리더보드', world:'세계', country:'국가', you:'나', quick:'빠른 대전', airivals:'AI 라이벌 7명과 대결 — 마지막 생존자가 승리!', online_soon:'온라인 방 곧 출시', finding:'파일럿 찾는 중…', winner:'승리!', eliminated:'탈락', place:'순위', alive:'생존', newrecord:'신기록!', soclose:'아깝다!', boss_in:'보스 등장!', boss_out:'보스 격파!', meteor:'유성우!', coinrush:'코인 러시!', nameq:'이름을 선택하세요', flagq:'국가를 선택하세요', gift:'일일 연속', firstrun:'오늘 첫 주행: 코인 2배!', armorbrk:'방어구 파손!', nearmiss:'아슬아슬!', hint:'← 스와이프 → 차선 변경 | ↑ 상승 | ↓ 하강', premium:'프리미엄 해제', daysleft:'일 남음', tier:'티어' } },
};
// varsayılan dil: cihaz dili destekleniyorsa o, değilse İngilizce
if (!save.lang || !LANGS[save.lang]) {
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  save.lang = LANGS[nav] ? nav : 'en';
}
function T(k) {
  const d = LANGS[save.lang] ? LANGS[save.lang].d : {};
  return d[k] !== undefined ? d[k] : (k in LANGS.en.d ? LANGS.en.d[k] : ({
    play:'PLAY', garage:'GARAGE', season:'SEASON PASS', multi:'MULTIPLAYER', settings:'SETTINGS', missions:'MISSIONS', best:'BEST', coins:'COINS', gameover:'GAME OVER', score:'Score', dist:'Distance', collected:'Collected', near:'Near misses', again:'PLAY AGAIN', mainmenu:'MAIN MENU', share:'SHARE SCORE', continueq:'CONTINUE?', revive:'REVIVE', giveup:'GIVE UP', watchad:'WATCH AD · FREE', luckybox:'LUCKY BOX', openbox:'OPEN LUCKY BOX', claim:'CLAIM', sound:'Sound effects', music:'Music', vib:'Vibration', tutorial:'Tutorial', reset:'Reset progress', lang:'Language', feedback:'Feedback & bug report', profile:'Profile', powerups:'POWER-UPS', trails:'EXHAUST TRAILS', drones:'DRONES', boosters:'ONE-TIME BOOSTERS', stats:'STATS', ach:'ACHIEVEMENTS', select:'SELECT', selected:'SELECTED', equip:'EQUIP', equipped:'EQUIPPED', buy:'BUY', use:'Use boosters?', start:'START', lead:'LEADERBOARD', world:'WORLD', country:'COUNTRY', daily:'DAILY', weekly:'WEEKLY', you:'YOU', quick:'QUICK MATCH', airivals:'Race 7 AI rivals — last one alive wins!', online_soon:'Online rooms coming soon', finding:'Finding pilots…', winner:'WINNER!', eliminated:'ELIMINATED', place:'Place', alive:'alive', newrecord:'NEW RECORD!', soclose:'SO CLOSE!', boss_in:'BOSS INCOMING!', boss_out:'BOSS DEFEATED!', meteor:'METEOR SHOWER!', coinrush:'COIN RUSH!', nameq:'CHOOSE YOUR PILOT NAME', flagq:'Choose your country', lab:'ROCKET LAB', build:'BUILD YOUR OWN ROCKET', createroom:'CREATE ROOM', joinroom:'JOIN ROOM', roomcode:'ROOM CODE', waiting:'Waiting for host…', roomnf:'Room not found', enter:'ENTER', startrace:'START RACE', campaign:'CAMPAIGN', leveldone:'LEVEL COMPLETE!', invite:'Invite Friends', rate:'Rate Us', yourcode:'Your invite code', entercode:"Enter friend's code", redeem:'REDEEM', invited:'Invite reward claimed!', offhint:'📴 You are offline — your score & progress are not saved. Go online!', codeused:'You already used an invite', codeself:"Can't use your own code", codenf:'Code not found', chapter:'Chapter', level:'Level', locked:'🔒 LOCKED', complete:'✓ DONE', gift:'Daily Streak', firstrun:'FIRST RUN TODAY: 2X COINS!', armorbrk:'Armor broken!', nearmiss:'Near miss!', hint:'← Swipe → change lane | ↑ climb | ↓ dive', premium:'UNLOCK PREMIUM', daysleft:'days left', tier:'Tier'
  })[k] || k);
}
// statik HTML metinlerini uygula
function applyTexts() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
  document.getElementById('tapHint').textContent = T('hint');
}

// ---------- ÜLKELER & BAYRAKLAR ----------
const COUNTRIES = ['TR','US','DE','FR','GB','ES','IT','RU','BR','MX','AR','IN','ID','PK','BD','NG','EG','SA','AZ','KZ','UA','PL','NL','JP','KR','CN','VN','TH','PH','MY'];
// ---------- Özel rozetler (gizli kod: yandan sembol sarması ¤/★/§/♦) ----------
// Adı ¤FOUNDER...¤ olan oyuncu herkese "FOUNDER" + kırmızı kalkan olarak görünür;
// gerçek iç ad hiç gösterilmez. MOD/VIP/OG rozetleri de aynı mantık.
const NAME_BADGES = [
  { re: /^([¤★§♦])\s*FOUNDER.*\1$/i, label: 'FOUNDER', cls: 'b-founder', icon: '🛡' },
  { re: /^([¤★§♦])\s*MOD.*\1$/i,     label: 'MOD',     cls: 'b-mod',     icon: '🛡' },
  { re: /^([¤★§♦])\s*VIP.*\1$/i,     label: 'VIP',     cls: 'b-vip',     icon: '⭐' },
  { re: /^([¤★§♦])\s*OG.*\1$/i,      label: 'OG',      cls: 'b-og',      icon: '🎖' },
];
function badgeOf(n) { if (typeof n !== 'string') return null; const t = n.trim(); for (const b of NAME_BADGES) if (b.re.test(t)) return b; return null; }
function isFounder(n) { return !!badgeOf(n); }
function escHTML(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
// bir adı güvenli HTML olarak biçimlendir (rozet varsa rozet + etiket, iç ad gizli)
function nameHTML(raw, meColor) {
  const b = badgeOf(raw);
  if (b) return '<span class="fbadge ' + b.cls + '">' + b.icon + '</span><b class="fname ' + b.cls + '">' + b.label + '</b>';
  const t = escHTML(raw || '');
  return meColor ? '<b style="color:' + meColor + '">' + t + '</b>' : t;
}

function flagOf(cc) {
  if (!cc || cc.length !== 2) return '🌍';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0)));
}
function detectCountry() {
  const loc = navigator.language || '';
  const m = loc.match(/-([A-Z]{2})/i);
  if (m && COUNTRIES.includes(m[1].toUpperCase())) return m[1].toUpperCase();
  const byLang = { tr:'TR', az:'AZ', de:'DE', fr:'FR', es:'ES', it:'IT', ru:'RU', pt:'BR', hi:'IN', id:'ID', ar:'SA', zh:'CN', ja:'JP', ko:'KR', en:'US' };
  return byLang[(loc.slice(0,2) || 'en').toLowerCase()] || 'US';
}

// ---------- FIREBASE (anonim giriş + gerçek skor tablosu) ----------
// Kurucu (founder) uid — tek kalıcı yetkili. Değişirse hem burada hem
// firestore.rules'da güncellenir.
const FOUNDER_UID = 'fYxDBJP0yAaVbfBcXgGUeIo7VKl1';
const FB = {
  ok: false, uid: null, token: null, rows: null, rowsAt: 0,
  cfg() { return (typeof FIREBASE !== 'undefined' && FIREBASE.apiKey && FIREBASE.projectId) ? FIREBASE : null; },
  async init() {
    const c = this.cfg();
    if (!c) return;
    try {
      const stored = JSON.parse(localStorage.getItem('rr_fb') || 'null');
      if (stored && stored.rt) {
        // oturumu yenile (uid sabit kalsın)
        const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + c.apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(stored.rt),
        }).then(x => x.json());
        if (r.id_token) {
          this.uid = r.user_id; this.token = r.id_token; this.ok = true;
          localStorage.setItem('rr_fb', JSON.stringify({ rt: r.refresh_token }));
          return;
        }
      }
      // ilk kez: anonim hesap aç
      const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + c.apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      }).then(x => x.json());
      if (r.idToken) {
        this.uid = r.localId; this.token = r.idToken; this.ok = true;
        localStorage.setItem('rr_fb', JSON.stringify({ rt: r.refreshToken }));
      }
    } catch (e) { this.ok = false; }
  },
  async submit() {
    const c = this.cfg();
    if (!c || !this.ok || !save.best || this.banned) return;
    try {
      await fetch('https://firestore.googleapis.com/v1/projects/' + c.projectId +
        '/databases/(default)/documents/scores/' + this.uid +
        '?updateMask.fieldPaths=name&updateMask.fieldPaths=country&updateMask.fieldPaths=best&updateMask.fieldPaths=t', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token },
        body: JSON.stringify({ fields: {
          name: { stringValue: (save.name || 'Pilot').slice(0, 12) },
          country: { stringValue: save.country || 'US' },
          best: { integerValue: String(Math.floor(save.best)) },
          t: { integerValue: String(Date.now()) },
        } }),
      });
    } catch (e) {}
  },
  async fetchTop() {
    const c = this.cfg();
    if (!c || !this.ok) return null;
    if (this.rows && Date.now() - this.rowsAt < 60000) return this.rows; // 1 dk önbellek
    try {
      const r = await fetch('https://firestore.googleapis.com/v1/projects/' + c.projectId +
        '/databases/(default)/documents:runQuery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: 'scores' }],
          orderBy: [{ field: { fieldPath: 'best' }, direction: 'DESCENDING' }],
          limit: 200,
        } }),
      }).then(x => x.json());
      const rows = [];
      for (const it of r) {
        if (!it.document) continue;
        const f = it.document.fields || {};
        const uid = it.document.name.split('/').pop();
        rows.push({
          id: uid,
          name: f.name ? f.name.stringValue : 'Pilot',
          cc: f.country ? f.country.stringValue : 'US',
          s: f.best ? parseInt(f.best.integerValue) : 0,
          me: uid === this.uid,
        });
      }
      // aktif banlı oyuncuları gizle + admin işareti koy
      const bans = await this.fetchBans();
      const adm = await this.fetchAdmins();
      const clean = rows.filter(r => !this.banActive(bans.get(r.id)));
      for (const r of clean) { r.admin = adm.has(r.id); r.founder = (r.id === FOUNDER_UID); }
      if (rows.length) { this.rows = clean; this.rowsAt = Date.now(); return clean; }
    } catch (e) {}
    return null;
  },

  // ---- MODERASYON + ROLLER ----
  banned: false,               // benim aktif ban durumum
  role: 'user',                // 'founder' | 'admin' | 'user'
  admins: null,                // admin uid seti (rozet + rol için)
  _bans: null, _bansAt: 0,     // uid -> { permanent, until, reason, by }

  // ban aktif mi? (kalıcı VEYA süresi dolmamış geçici)
  banActive(b) { return !!b && (b.permanent === true || (typeof b.until === 'number' && b.until > Date.now())); },

  async fetchBans() {
    const c = this.cfg();
    if (!c || !this.ok) return this._bans || (this._bans = new Map());
    if (this._bans && Date.now() - this._bansAt < 30000) return this._bans;
    const m = new Map();
    try {
      const r = await fetch(this.base() + '/bans?pageSize=300', { headers: this.hdr() }).then(x => x.json());
      for (const d of (r.documents || [])) m.set(d.name.split('/').pop(), this.dec(d));
    } catch (e) {}
    this._bans = m; this._bansAt = Date.now();
    return m;
  },
  async isBanned(uid) { const m = await this.fetchBans(); return this.banActive(m.get(uid)); },

  // rol tespiti
  async fetchAdmins() {
    const c = this.cfg();
    if (!c || !this.ok) return this.admins || (this.admins = new Set());
    try {
      const r = await fetch(this.base() + '/admins?pageSize=300', { headers: this.hdr() }).then(x => x.json());
      this.admins = new Set((r.documents || []).map(d => d.name.split('/').pop()));
    } catch (e) { this.admins = this.admins || new Set(); }
    return this.admins;
  },
  async detectRole() {
    if (!this.ok) { this.role = 'user'; return this.role; }
    if (this.uid === FOUNDER_UID) { this.role = 'founder'; return this.role; }
    const a = await this.fetchAdmins();
    this.role = a.has(this.uid) ? 'admin' : 'user';
    return this.role;
  },
  isStaff() { return this.role === 'founder' || this.role === 'admin'; },

  // create yardımcı (otomatik id)
  async create(coll, obj) { const c = this.cfg(); if (!c || !this.ok) return null; try { return await fetch(this.base() + '/' + coll, { method: 'POST', headers: this.hdr(), body: JSON.stringify(this.enc(obj)) }).then(x => x.json()); } catch (e) { return null; } },

  // ban uygula: opts { permanent:bool, days:int, reason:str }
  async ban(uid, opts) {
    opts = opts || {};
    const rec = {
      by: this.uid, t: Date.now(), reason: (opts.reason || '').slice(0, 200),
      permanent: !!opts.permanent, until: opts.permanent ? 0 : Date.now() + (opts.days || 7) * 864e5,
    };
    const r = await this.put('bans/' + uid, rec);
    const ok = !!(r && !r.error && r.name);
    if (ok) { await this.del('scores/' + uid); this._bansAt = 0; this.rowsAt = 0; }
    return ok;
  },
  async unban(uid) { const r = await this.del('bans/' + uid); this._bansAt = 0; this.rowsAt = 0; return !(r && r.error); },

  // admin → founder'a kalıcı ban isteği
  async requestPermBan(uid, reason) { const r = await this.put('ban_requests/' + uid, { by: this.uid, reason: (reason || '').slice(0, 200), t: Date.now() }); return !!(r && !r.error && r.name); },
  async listBanReqs() { try { const r = await fetch(this.base() + '/ban_requests?pageSize=100', { headers: this.hdr() }).then(x => x.json()); return (r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...this.dec(d) })); } catch (e) { return []; } },
  async clearBanReq(uid) { await this.del('ban_requests/' + uid); },

  // admin başvurusu
  async applyAdmin(reason) { const r = await this.put('admin_requests/' + this.uid, { name: (save.name || 'Pilot').slice(0, 16), reason: (reason || '').slice(0, 300), t: Date.now() }); return !!(r && !r.error && r.name); },
  async listAdminReqs() { try { const r = await fetch(this.base() + '/admin_requests?pageSize=100', { headers: this.hdr() }).then(x => x.json()); return (r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...this.dec(d) })); } catch (e) { return []; } },
  async approveAdmin(uid, name) { const r = await this.put('admins/' + uid, { name: (name || 'Admin').slice(0, 16), t: Date.now() }); const ok = !!(r && !r.error && r.name); if (ok) { await this.del('admin_requests/' + uid); this.admins = null; } return ok; },
  async rejectAdmin(uid) { await this.del('admin_requests/' + uid); },
  async listAdmins() { try { const r = await fetch(this.base() + '/admins?pageSize=300', { headers: this.hdr() }).then(x => x.json()); return (r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...this.dec(d) })); } catch (e) { return []; } },
  async removeAdmin(uid) { await this.del('admins/' + uid); this.admins = null; },

  // hata bildirimi
  async sendReport(type, text) { return await this.create('reports', { type: type, text: (text || '').slice(0, 500), name: (save.name || 'Pilot').slice(0, 16), uid: this.uid, status: 'open', t: Date.now() }); },
  async listReports() { try { const r = await fetch(this.base() + '/reports?pageSize=100', { headers: this.hdr() }).then(x => x.json()); return (r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...this.dec(d) })).sort((a, b) => (b.t || 0) - (a.t || 0)); } catch (e) { return []; } },
  async resolveReport(id) { await this.del('reports/' + id); },

  // destek sohbeti (ticket = uid başına)
  async openTicket() { await this.put('tickets/' + this.uid, { name: (save.name || 'Pilot').slice(0, 16), uid: this.uid, status: 'open', t: Date.now() }); },
  async ticketSend(uid, from, text) { return await this.create('tickets/' + uid + '/messages', { from: from, name: (save.name || 'Pilot').slice(0, 16), text: (text || '').slice(0, 500), t: Date.now() }); },
  async ticketMsgs(uid) { try { const r = await fetch(this.base() + '/tickets/' + uid + '/messages?pageSize=100', { headers: this.hdr() }).then(x => x.json()); return (r.documents || []).map(d => this.dec(d)).sort((a, b) => (a.t || 0) - (b.t || 0)); } catch (e) { return []; } },
  async listTickets() { try { const r = await fetch(this.base() + '/tickets?pageSize=100', { headers: this.hdr() }).then(x => x.json()); return (r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...this.dec(d) })).sort((a, b) => (b.t || 0) - (a.t || 0)); } catch (e) { return []; } },
  // ---- düşük seviye Firestore yardımcıları (odalar + turnuva + bulut) ----
  base() { const c = this.cfg(); return 'https://firestore.googleapis.com/v1/projects/' + c.projectId + '/databases/(default)/documents'; },
  hdr() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token }; },
  enc(o) { // js objesi → firestore fields
    const f = {};
    for (const k in o) {
      const v = o[k];
      if (typeof v === 'number') f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      else if (typeof v === 'boolean') f[k] = { booleanValue: v };
      else f[k] = { stringValue: String(v) };
    }
    return { fields: f };
  },
  dec(doc) { const o = {}; const f = (doc && doc.fields) || {}; for (const k in f) { const v = f[k]; o[k] = v.integerValue !== undefined ? parseInt(v.integerValue) : v.doubleValue !== undefined ? v.doubleValue : v.booleanValue !== undefined ? v.booleanValue : v.stringValue; } return o; },
  async put(path, obj) { const c = this.cfg(); if (!c || !this.ok) return null; try { const mask = Object.keys(obj).map(k => 'updateMask.fieldPaths=' + k).join('&'); return await fetch(this.base() + '/' + path + '?' + mask, { method: 'PATCH', headers: this.hdr(), body: JSON.stringify(this.enc(obj)) }).then(x => x.json()); } catch (e) { return null; } },
  async get(path) { const c = this.cfg(); if (!c || !this.ok) return null; try { const r = await fetch(this.base() + '/' + path, { headers: this.hdr() }).then(x => x.json()); return r.fields ? this.dec(r) : null; } catch (e) { return null; } },
  async del(path) { const c = this.cfg(); if (!c || !this.ok) return; try { await fetch(this.base() + '/' + path, { method: 'DELETE', headers: this.hdr() }); } catch (e) {} },
  async list(coll) { const c = this.cfg(); if (!c || !this.ok) return []; try { const r = await fetch(this.base() + '/' + coll + '?pageSize=20', { headers: this.hdr() }).then(x => x.json()); return (r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...this.dec(d) })); } catch (e) { return []; } },
  // ---- turnuva skor tablosu (günlük/haftalık ayrı koleksiyon) ----
  async submitTournament(sc) {
    const c = this.cfg(); if (!c || !this.ok || !sc || this.banned) return;
    const day = Math.floor(Date.now() / 864e5), week = Math.floor(day / 7);
    for (const coll of ['t_day_' + day, 't_week_' + week]) {
      const cur = await this.get(coll + '/' + this.uid);
      if (!cur || sc > (cur.best || 0)) await this.put(coll + '/' + this.uid, { name: (save.name || 'Pilot').slice(0, 12), country: save.country || 'US', best: Math.floor(sc), t: Date.now() });
    }
  },
  async fetchTournament(weekly) {
    const c = this.cfg(); if (!c || !this.ok) return null;
    const day = Math.floor(Date.now() / 864e5), week = Math.floor(day / 7);
    const coll = weekly ? 't_week_' + week : 't_day_' + day;
    try {
      const r = await fetch(this.base() + ':runQuery', { method: 'POST', headers: this.hdr(),
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], orderBy: [{ field: { fieldPath: 'best' }, direction: 'DESCENDING' }], limit: 100 } }) }).then(x => x.json());
      const rows = [];
      for (const it of r) { if (!it.document) continue; const f = this.dec(it.document); const uid = it.document.name.split('/').pop(); rows.push({ name: f.name || 'Pilot', cc: f.country || 'US', s: f.best || 0, me: uid === this.uid }); }
      return rows;
    } catch (e) { return null; }
  },
  // ---- bulut kayıt ----
  async cloudSave() {
    if (!this.cfg() || !this.ok) return;
    const blob = JSON.stringify(save);
    await this.put('saves/' + this.uid, { data: blob, best: Math.floor(save.best || 0), t: Date.now() });
  },
  async cloudLoad() {
    if (!this.cfg() || !this.ok) return null;
    const d = await this.get('saves/' + this.uid);
    if (d && d.data) { try { return JSON.parse(d.data); } catch (e) {} }
    return null;
  },
  // ---- davet sistemi ----
  gen6() { const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += cs[Math.floor(Math.random() * cs.length)]; return c; },
  async ensureInviteCode() {
    if (!this.cfg() || !this.ok) return;
    if (save.inviteCode) { await this.put('invites/' + save.inviteCode, { uid: this.uid }); return; }
    for (let tries = 0; tries < 4; tries++) {
      const code = this.gen6();
      const exists = await this.get('invites/' + code);
      if (!exists) { save.inviteCode = code; persist(); await this.put('invites/' + code, { uid: this.uid }); return; }
    }
  },
  async redeem(code) {
    if (!this.cfg() || !this.ok) return { ok: false, msg: 'offline' };
    if (save.referredBy) return { ok: false, msg: 'used' };
    if (code === save.inviteCode) return { ok: false, msg: 'self' };
    const rec = await this.get('invites/' + code);
    if (!rec || !rec.uid) return { ok: false, msg: 'notfound' };
    await this.put('referrals/' + this.uid, { ref: rec.uid, t: Date.now() });
    save.referredBy = code; save.coins += INVITE_REWARD; persist();
    return { ok: true };
  },
  // beni davet edenlere ödül yaz (açılışta): referrals where ref==myUid
  async creditReferrals() {
    if (!this.cfg() || !this.ok) return;
    try {
      const r = await fetch(this.base() + ':runQuery', { method: 'POST', headers: this.hdr(),
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'referrals' }],
          where: { fieldFilter: { field: { fieldPath: 'ref' }, op: 'EQUAL', value: { stringValue: this.uid } } }, limit: 50 } }) }).then(x => x.json());
      let gained = 0;
      for (const it of (r || [])) {
        if (!it.document) continue;
        const who = it.document.name.split('/').pop();
        if (!save.refCredited.includes(who)) { save.refCredited.push(who); save.coins += REFERRER_REWARD; gained += REFERRER_REWARD; }
      }
      if (gained) { persist(); return gained; }
    } catch (e) {}
    return 0;
  },
};

// bulut kaydını yerelle birleştir (ilerleme asla kaybolmaz: sayılarda maks, dizilerde birleşim)
function mergeCloud(cl) {
  if (!cl || typeof cl !== 'object') return false;
  let changed = false;
  const numMax = k => { if (typeof cl[k] === 'number' && cl[k] > (save[k] || 0)) { save[k] = cl[k]; changed = true; } };
  numMax('coins'); numMax('best'); numMax('xp');
  const uni = k => { if (Array.isArray(cl[k])) { const set = new Set([...(save[k] || []), ...cl[k]]); if (set.size !== (save[k] || []).length) { save[k] = [...set]; changed = true; } } };
  uni('owned'); uni('trailOwned'); uni('droneOwned'); uni('ach');
  for (const g of ['upg', 'parts', 'partsOwned', 'items', 'stats']) {
    if (cl[g] && typeof cl[g] === 'object') {
      save[g] = save[g] || {};
      for (const k in cl[g]) {
        if (Array.isArray(cl[g][k])) { const set = new Set([...((save[g][k]) || []), ...cl[g][k]]); if (set.size !== ((save[g][k]) || []).length) { save[g][k] = [...set]; changed = true; } }
        else if (typeof cl[g][k] === 'number' && cl[g][k] > (save[g][k] || 0)) { save[g][k] = cl[g][k]; changed = true; }
      }
    }
  }
  if (changed) persist();
  return changed;
}
// oturum açılınca bulutu çek + birleştir; sonra kendi güncel kaydını buluta yaz
FB.init().then(async () => {
  if (!FB.ok) return;
  // rol tespiti (founder / admin / user) + ban durumu
  await FB.detectRole();
  FB.banned = await FB.isBanned(FB.uid);
  if (FB.banned && typeof popup === 'function') setTimeout(() => popup('🚫 Hesabın yasaklandı — skorların kaydedilmiyor', '#ff6b6b'), 1200);
  if (typeof window.refreshStaffUI === 'function') window.refreshStaffUI(); // panel butonunu role göre göster
  const cl = await FB.cloudLoad();
  mergeCloud(cl);
  await FB.ensureInviteCode();           // davet kodumu garanti et
  const gained = await FB.creditReferrals(); // beni davet edenleri ödüllendir
  if (typeof showMenu === 'function' && state === S.MENU) showMenu();
  if (gained && typeof popup === 'function') setTimeout(() => popup('🎁 +🪙' + gained + ' (' + T('invite') + ')', '#9dff70'), 500);
  FB.cloudSave();
});

// ---------- SKOR TABLOSU (çevrimdışı — yapay rakipler) ----------
const BOT_NAMES = ['NovaHunter','StarKing','AstroWolf','CometQueen','GalaxyRid3r','PulsarPete','OrbitOzzy','LunaLina','MeteorMike','VoidViper','NebulaNia','RocketRex','SolarSam','CosmoCat','WarpWiz','IonIzzy','QuasarQ','ZeroGravy','SkyPirate','AstroNomad','TurboTuna','PhotonPhil','DarkMatterD','GravityGuru','StarSurfer','MoonMender','FlareFox','OrionOtto','VegaVicky','TitanTaz'];
function seededRand(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }
function genBoard(world) {
  // günlük deterministik liste; oyuncunun rekoruna göre kalibre
  const day = Math.floor(Date.now() / 864e5);
  const rnd = seededRand(day * (world ? 7919 : 104729) + 17);
  const base = Math.max(2000, save.best);
  const rows = [];
  for (let i = 0; i < 19; i++) {
    const f = 0.25 + Math.pow(rnd(), 2.2) * 2.6; // çoğunluk altında, azı üstünde
    rows.push({
      name: BOT_NAMES[Math.floor(rnd() * BOT_NAMES.length)] + (rnd() < 0.4 ? Math.floor(rnd() * 99) : ''),
      cc: world ? COUNTRIES[Math.floor(rnd() * COUNTRIES.length)] : (save.country || 'US'),
      s: Math.floor(base * f),
    });
  }
  rows.push({ name: save.name || 'You', cc: save.country || 'US', s: save.best, me: true });
  rows.sort((a, b) => b.s - a.s);
  return rows;
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ---------- Ses (prosedürel, dosyasız) ----------
let actx = null;
function initAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') actx.resume();
  if (actx && typeof Music !== 'undefined') Music.start();
}
function tone(f0, f1, dur, type, vol) {
  if (save.muted || !actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, actx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
function noiseBurst(dur, vol, freq) {
  if (save.muted || !actx) return;
  const n = actx.sampleRate * dur, buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = actx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(actx.destination); src.start();
}
const SFX = {
  coin:    n => { const m = Math.pow(1.059, Math.min(n || 0, 14)); tone(950 * m, 1500 * m, 0.09, 'square', 0.12); },
  pu:      () => { tone(520, 780, 0.1, 'triangle', 0.2); setTimeout(() => tone(780, 1180, 0.12, 'triangle', 0.2), 90); },
  crash:   () => { noiseBurst(0.5, 0.5, 900); tone(220, 40, 0.5, 'sawtooth', 0.35); },
  near:    () => noiseBurst(0.1, 0.18, 2600),
  ui:      () => tone(620, 620, 0.06, 'sine', 0.15),
  buy:     () => { tone(700, 1050, 0.12, 'square', 0.15); setTimeout(() => tone(1050, 1400, 0.14, 'square', 0.15), 100); },
  revive:  () => tone(380, 950, 0.35, 'triangle', 0.25),
  mission: () => { tone(700, 700, 0.1, 'square', 0.15); setTimeout(() => tone(1050, 1050, 0.18, 'square', 0.15), 120); },
  swoosh:  () => noiseBurst(0.07, 0.1, 1600),
};
function vib(ms) { try { if (!save.vibOff && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

// ---------- Prosedürel müzik (dosyasız synthwave döngüsü) ----------
const Music = {
  timer: null, step: 0, nextT: 0,
  // Am - F - C - G akor yürüyüşü (kök frekansları)
  roots: [110, 87.31, 130.81, 98],
  start() {
    if (!actx || this.timer) return;
    this.nextT = actx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), 25);
  },
  note(f, t, dur, type, vol) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur);
  },
  hat(t, vol) {
    const n = actx.sampleRate * 0.03, buf = actx.createBuffer(1, n, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = actx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t);
  },
  kick(t) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.15);
  },
  tick() {
    if (save.musicOff || !actx || document.hidden) return;
    const bpm = state === S.PLAY ? 138 : 108;
    const spb = 60 / bpm / 2; // 8'lik nota süresi
    while (this.nextT < actx.currentTime + 0.12) {
      this.playStep(this.step, this.nextT, spb);
      this.nextT += spb;
      this.step = (this.step + 1) % 32; // 4 bar x 8 adım
    }
  },
  pad(f, t, dur, vol) { // yumuşak akor katmanı (iki hafif detune osilatör)
    for (const d of [1, 1.006]) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f * d;
      const flt = actx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1400;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.001, t + dur);
      o.connect(flt); flt.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur);
    }
  },
  playStep(i, t, spb) {
    const bar = Math.floor(i / 8), st = i % 8;
    const root = this.roots[bar];
    if (st % 2 === 0) this.note(root, t, spb * 1.8, 'square', 0.05);            // bas
    if (st === 0 || st === 4) this.kick(t);                                     // kick
    if (st % 2 === 1) this.hat(t, state === S.PLAY ? 0.05 : 0.025);             // hi-hat
    // akor pad'i her barın başında (menüde de, hafif atmosfer)
    if (st === 0) { this.pad(root, t, spb * 8, state === S.PLAY ? 0.03 : 0.022); this.pad(root * 1.5, t, spb * 8, state === S.PLAY ? 0.022 : 0.016); }
    if (state === S.PLAY) {                                                     // arpej + lead sadece oyunda
      const arp = [2, 3, 4, 3][st % 4];
      this.note(root * arp, t, spb * 0.9, 'triangle', 0.035);
      if (st === 6) this.note(root * 5, t, spb * 0.9, 'triangle', 0.03);
      // 2 barda bir kısa lead motifi
      if (bar % 2 === 1 && (st === 2 || st === 5)) this.note(root * (st === 2 ? 6 : 8), t, spb * 1.4, 'sawtooth', 0.028);
    }
  },
};

// ---------- Reklamlar (Android köprüsü; tarayıcıda sessizce devre dışı) ----------
const Ads = {
  bridge: () => (typeof AndroidAds !== 'undefined' ? AndroidAds : null),
  rewardedReady() { const b = this.bridge(); try { return !!(b && b.isRewardedReady()); } catch (e) { return false; } },
  showRewarded() { const b = this.bridge(); try { b && b.showRewarded(); } catch (e) {} },
  // Geçiş reklamı sıklık koruması: oturumdaki ilk ölümde gösterme,
  // sonrasında en erken 60 sn'de bir (AdMob politikası + oyuncu deneyimi)
  lastInterstitial: 0,
  deaths: 0,
  maybeShowInterstitial() {
    const b = this.bridge();
    if (!b) return;
    this.deaths++;
    const now = Date.now();
    if (this.deaths < 2 || now - this.lastInterstitial < 60000) return;
    try {
      if (b.isInterstitialReady()) {
        this.lastInterstitial = now;
        b.showInterstitial();
      }
    } catch (e) {}
  },
};

// ---------- Roketler ----------
const ROCKETS = [
  { name: 'Rookie',        icon: '🚀', desc: "Everyone's first rocket.",                    price: 0,     body: 0xd8dce6, fin: 0xe8511a, flame: 0xffa040, magnet: 0,  shield: 0, scoreMul: 1.0,  coinMul: 1 },
  { name: 'Lightning',     icon: '⚡', desc: 'Earns points 25% faster.',            price: 500,   body: 0x3d6cff, fin: 0xffd54d, flame: 0x66ccff, magnet: 0,  shield: 0, scoreMul: 1.25, coinMul: 1 },
  { name: 'Magnet X',      icon: '🧲', desc: 'Pulls coins from afar.',        price: 1500,  body: 0xb03df0, fin: 0x2bd4a0, flame: 0xff66ff, magnet: 7,  shield: 0, scoreMul: 1.25, coinMul: 1 },
  { name: 'Armored Titan', icon: '🛡️', desc: 'Survives 1 crash per run.',        price: 3000,  body: 0x39424f, fin: 0xc0c8d4, flame: 0xff5533, magnet: 0,  shield: 1, scoreMul: 1.5,  coinMul: 1, boosters: true },
  { name: 'Golden Legend', icon: '👑', desc: 'Magnet + armor + 2x coins.',             price: 8000,  body: 0xffc832, fin: 0xff6d1f, flame: 0xfff0a0, magnet: 8,  shield: 1, scoreMul: 2.0,  coinMul: 2, boosters: true },
  { name: 'Plasma Ghost',  icon: '👻', desc: 'Fastest scoring, strong magnet.',   price: 15000, body: 0x66ffee, fin: 0x1a8877, flame: 0xaaffee, magnet: 9,  shield: 1, scoreMul: 2.5,  coinMul: 2, boosters: true, glow: true },
  { name: 'Black Hole',    icon: '🌌', desc: 'Ultimate: 2 armor, 3x score, 3x coins.', price: 30000, body: 0x8844ff, fin: 0x2a0d55, flame: 0xcc88ff, magnet: 10, shield: 2, scoreMul: 3.0,  coinMul: 3, boosters: true, glow: true, ring: true },
  { name: 'Comet',         icon: '☄️', desc: 'Season exclusive. Fast & fierce.',       price: -1,    body: 0x77e0ff, fin: 0xffffff, flame: 0x99f0ff, magnet: 8,  shield: 1, scoreMul: 2.6,  coinMul: 2, boosters: true, glow: true },
];

// ---------- Yoldaş dronlar (mağaza) ----------
const DRONES = [
  { name: 'Coiny',  icon: '🟡', color: 0xffd54d, price: 5000,  desc: '+10% coins',            coinBonus: 0.10 },
  { name: 'Volty',  icon: '🔵', color: 0x55aaff, price: 8000,  desc: '+10% score',            scoreBonus: 0.10 },
  { name: 'Maggy',  icon: '🟣', color: 0xff44cc, price: 12000, desc: '+2 magnet range',       magnetBonus: 2 },
  { name: 'Guardy', icon: '🟢', color: 0x66ee66, price: 20000, desc: '+1 armor every run',    shieldBonus: 1 },
  { name: 'Starry', icon: '⭐', color: 0xfff0a0, price: -1,    desc: '+5% score & +5% coins',  scoreBonus: 0.05, coinBonus: 0.05 }, // sezon pass ödülü
];

// ---------- ROCKET LAB: parça kataloğu (uç oyun para gideri) ----------
const PARTS = {
  nose:   { icon: '🔺', name: 'NOSE', opts: [
    { n: 'Basic Tip',     p: 0,      c: 0xd8dce6, score: 0 },
    { n: 'Aero Cone',     p: 15000,  c: 0x55aaff, score: 0.2 },
    { n: 'Razor Spike',   p: 80000,  c: 0xb03df0, score: 0.5 },
    { n: 'Neutron Tip',   p: 250000, c: 0xff5533, score: 0.9 },
    { n: 'Singularity',   p: 700000, c: 0xffc832, score: 1.4 },
  ] },
  body:   { icon: '🛢️', name: 'BODY', opts: [
    { n: 'Tin Can',       p: 0,      c: 0xd8dce6, shield: 0 },
    { n: 'Steel Hull',    p: 20000,  c: 0x8899aa, shield: 1 },
    { n: 'Hex Armor',     p: 100000, c: 0x39424f, shield: 1 },
    { n: 'Titan Plate',   p: 300000, c: 0xff8a2a, shield: 2 },
    { n: 'Void Core',     p: 750000, c: 0x8844ff, shield: 3 },
  ] },
  fins:   { icon: '🪽', name: 'FINS', opts: [
    { n: 'Stubby',        p: 0,      c: 0xe8511a, magnet: 0 },
    { n: 'Quad Fins',     p: 15000,  c: 0x2bd4a0, magnet: 3 },
    { n: 'Delta Wings',   p: 80000,  c: 0x66ccff, magnet: 5 },
    { n: 'Blade Array',   p: 250000, c: 0xff44cc, magnet: 7 },
    { n: 'Gravity Sails', p: 700000, c: 0xfff0a0, magnet: 10 },
  ] },
  engine: { icon: '🔥', name: 'ENGINE', opts: [
    { n: 'Sputter Jet',   p: 0,      c: 0xffa040, coin: 0, score: 0 },
    { n: 'Twin Burner',   p: 20000,  c: 0x66ccff, coin: 0, score: 0.1 },
    { n: 'Tri Thruster',  p: 100000, c: 0x77ff55, coin: 1, score: 0.2 },
    { n: 'Nova Drive',    p: 300000, c: 0xff66ff, coin: 2, score: 0.4 },
    { n: 'Antimatter',    p: 750000, c: 0x99f0ff, coin: 3, score: 0.8 },
  ] },
  paint:  { icon: '🎨', name: 'PAINT', opts: [
    { n: 'Factory',   p: 0,      c: -1 },
    { n: 'Crimson',   p: 8000,   c: 0xe33b3b },
    { n: 'Ocean',     p: 8000,   c: 0x2b7fff },
    { n: 'Emerald',   p: 12000,  c: 0x2bd47a },
    { n: 'Sunset',    p: 20000,  c: 0xff8a2a },
    { n: 'Chrome',    p: 60000,  c: 0xd8dee8 },
    { n: 'Gold',      p: 150000, c: 0xffd54d },
    { n: 'Galactic',  p: 400000, c: 0xb46cff },
  ] },
};
const CUSTOM_ID = 99; // save.selected === 99 → özel roket
function getCustomDef() {
  const P = k => PARTS[k].opts[save.parts[k]];
  const mk = save.parts.nose + save.parts.body + save.parts.fins + save.parts.engine;
  return {
    name: 'Custom MK-' + (mk + 1), icon: '🛠️', custom: true, price: 0,
    desc: 'Your hand-built rocket.',
    body: (save.parts.paint > 0 ? PARTS.paint.opts[save.parts.paint].c : P('body').c), fin: P('fins').c, flame: P('engine').c,
    magnet: P('fins').magnet,
    shield: P('body').shield,
    scoreMul: +(1 + P('nose').score + P('engine').score).toFixed(2),
    coinMul: 1 + P('engine').coin,
    glow: save.parts.body >= 4,
  };
}
function getRocketDef() { return save.selected === CUSTOM_ID ? getCustomDef() : ROCKETS[save.selected] || ROCKETS[0]; }

// ---------- Egzoz izleri (mağaza) ----------
const TRAILS = [
  { name: 'Ember',   color: 0xffaa55, price: 0 },
  { name: 'Ion',     color: 0x55aaff, price: 800 },
  { name: 'Toxic',   color: 0x77ff55, price: 1500 },
  { name: 'Violet',  color: 0xcc66ff, price: 2500 },
  { name: 'Gold',    color: 0xffd54d, price: 4000 },
  { name: 'Rainbow', color: 0xff5555, price: 6000, rainbow: true },
  { name: 'Nova',    color: 0xffffff, price: -1 }, // sezon pass ödülü
];

// ---------- Güçlendirmeler ----------
const POWERUPS = {
  magnet: { icon: '🧲', name: 'Magnet',   desc: 'Pulls coins to you',      color: 0xff44cc },
  mult:   { icon: '✖️2', name: '2x Score', desc: 'Doubles your score',        color: 0x44ff88 },
  shield: { icon: '🛡️', name: 'Shield',   desc: 'Smash through obstacles',   color: 0x44aaff },
  turbo:  { icon: '🔥', name: 'Turbo',    desc: 'Unstoppable speed mode',  color: 0xff8800 },
};
const PU_KEYS = Object.keys(POWERUPS);
const UPG_PRICES = [400, 900, 1800, 3200];
const UPG_MAX = 4;
function puDuration(key) { return 6 + save.upg[key] * 2.5; }

// ---------- Görevler ----------
const MTYPES = [
  { id: 'coins_run',  txt: t => 'Collect ' + t + ' coins in one run',   targets: [15, 40, 80, 140, 220],        run: true,  stat: 'coins' },
  { id: 'coins_tot',  txt: t => 'Collect ' + t + ' coins in total',       targets: [100, 300, 800, 2000, 5000],   run: false, stat: 'coins' },
  { id: 'dist_run',   txt: t => 'Travel ' + t + ' m in one run',      targets: [500, 1200, 2500, 4500, 8000], run: true,  stat: 'dist' },
  { id: 'dist_tot',   txt: t => 'Travel ' + t + ' m in total',          targets: [2000, 6000, 15000, 40000, 90000], run: false, stat: 'dist' },
  { id: 'pu',         txt: t => 'Collect ' + t + ' power-ups',             targets: [3, 8, 18, 40, 80],            run: false, stat: 'pu' },
  { id: 'near',       txt: t => 'Make ' + t + ' near misses',               targets: [5, 15, 40, 90, 200],          run: false, stat: 'near' },
];
const M_REWARDS = [100, 250, 500, 1000, 2000];
function newMission(typeIdx, tier) {
  const mt = MTYPES[typeIdx];
  const ti = Math.min(tier, mt.targets.length - 1);
  const mul = Math.pow(2, Math.max(0, tier - (mt.targets.length - 1))); // maks tier sonrası hedef 2 katına
  return { t: typeIdx, tier: tier, target: mt.targets[ti] * mul, prog: 0, reward: M_REWARDS[ti] * mul };
}
if (!Array.isArray(save.missions) || save.missions.length !== 3) {
  const picks = [0, 2, 5]; // altın, mesafe, yakın geçiş ile başla
  save.missions = picks.map(i => newMission(i, 0));
}

// ---------- Rütbeler ----------
const RANKS = [
  [0, 'Rookie Pilot'], [2000, 'Space Cadet'], [6000, 'Star Pilot'],
  [15000, 'Nebula Master'], [35000, 'Galaxy Captain'], [80000, 'Space Legend'], [200000, 'Master of the Universe'],
];
function rankOf(xp) {
  let r = RANKS[0][1], next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i][0]) r = RANKS[i][1];
    else { next = RANKS[i]; break; }
  }
  return { name: r, next };
}

// ---------- Başarımlar ----------
const ACH_REWARD = 200;
const ACH = [
  { id: 'run1',       icon: '🛫', name: 'First Flight',  desc: 'Complete a run',            cond: s => s.stats.runs >= 1 },
  { id: 'coin1k',     icon: '💰', name: 'Coin Collector',desc: 'Collect 1,000 coins total', cond: s => s.stats.coins >= 1000 },
  { id: 'coin10k',    icon: '🤑', name: 'Space Tycoon',  desc: 'Collect 10,000 coins total',cond: s => s.stats.coins >= 10000 },
  { id: 'dist10k',    icon: '🛰️', name: 'Marathon',      desc: 'Travel 10,000 m total',     cond: s => s.stats.dist >= 10000 },
  { id: 'near100',    icon: '😱', name: 'Daredevil',     desc: '100 near misses total',     cond: s => s.stats.near >= 100 },
  { id: 'combo5',     icon: '🔥', name: 'Combo Master',  desc: 'Reach a x5 combo',          cond: s => s.stats.maxCombo >= 5 },
  { id: 'pu50',       icon: '⚡', name: 'Powered Up',    desc: 'Collect 50 power-ups',      cond: s => s.stats.pu >= 50 },
  { id: 'allrockets', icon: '🚀', name: 'Full Hangar',   desc: 'Own every rocket',          cond: s => s.owned.filter(i => ROCKETS[i] && ROCKETS[i].price >= 0).length >= ROCKETS.filter(r => r.price >= 0).length },
  { id: 'maxupg',     icon: '🏆', name: 'Maxed Out',     desc: 'Max out any power-up',      cond: s => PU_KEYS.some(k => s.upg[k] >= UPG_MAX) },
  { id: 'score10k',   icon: '🌟', name: 'Star Scorer',   desc: 'Score 10,000 in one run',   cond: s => s.best >= 10000 },
  { id: 'boss1',      icon: '👽', name: 'Boss Slayer',   desc: 'Survive a UFO boss',        cond: s => s.stats.boss >= 1 },
  { id: 'boss10',     icon: '🛸', name: 'Alien Nightmare', desc: 'Survive 10 UFO bosses',   cond: s => s.stats.boss >= 10 },
];
// yeni kazanılan başarımların adlarını döndürür (ödülü de yatırır)
function checkAch() {
  const got = [];
  for (const a of ACH) {
    if (save.ach.includes(a.id)) continue;
    let ok = false;
    try { ok = a.cond(save); } catch (e) {}
    if (ok) {
      save.ach.push(a.id);
      save.coins += ACH_REWARD;
      got.push(a.icon + ' ' + a.name);
    }
  }
  if (got.length) { persist(); SFX.mission(); }
  return got;
}

// ---------- Temalı bölgeler ----------
const THEMES = [
  { name: '🪐 Space Canyon', fog: 0x05010f, ground: 0x141033, rail: 0x3d3d8f, line: 0x3d3d8f },
  { name: '🌋 Lava Zone',     fog: 0x160301, ground: 0x2a0d08, rail: 0xff5522, line: 0x993311 },
  { name: '🧊 Ice Tunnel',    fog: 0x02121c, ground: 0x0d2733, rail: 0x44ddff, line: 0x1a5566 },
  { name: '🔮 Purple Nebula', fog: 0x12021a, ground: 0x220d33, rail: 0xcc55ff, line: 0x66337f },
  { name: '💚 Cyber Grid',    fog: 0x001208, ground: 0x02180a, rail: 0x00ff88, line: 0x00aa55 },
  { name: '☀️ Solar Storm',   fog: 0x1a0e00, ground: 0x2a1a05, rail: 0xffbb00, line: 0xaa7700 },
];
const THEME_LEN = 900; // metre
const themeTarget = { fog: new THREE.Color(THEMES[0].fog), ground: new THREE.Color(THEMES[0].ground), rail: new THREE.Color(THEMES[0].rail), line: new THREE.Color(THEMES[0].line) };
let themeIdx = 0;

// ---------- Sahne ----------
const LANES = [-3.2, 0, 3.2];
const FLY_LOW = 1.6, FLY_HIGH = 4.6;
const SPAWN_Z = -260;
const KILL_Z = 14;
const FAR_PLANE = 300;

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(THEMES[0].fog);
scene.fog = new THREE.Fog(THEMES[0].fog, 90, FAR_PLANE - 40);

const CAM_Y = 8.5, CAM_Z = 13;
const BASE_FOV = 72;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.5, FAR_PLANE);
camera.position.set(0, CAM_Y, CAM_Z);
camera.lookAt(0, 1.0, -40);
let camShake = 0;
let curFov = BASE_FOV;

scene.add(new THREE.HemisphereLight(0x8899ff, 0x201040, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(4, 10, 6);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Paylaşılan geometri & materyaller ----------
const MAT = {
  ground:  new THREE.MeshLambertMaterial({ color: THEMES[0].ground }),
  laneLine:new THREE.MeshBasicMaterial({ color: THEMES[0].line }),
  rail:    new THREE.MeshBasicMaterial({ color: THEMES[0].rail }),
  rockA:   new THREE.MeshLambertMaterial({ color: 0x6e5a4a, flatShading: true }),
  rockB:   new THREE.MeshLambertMaterial({ color: 0x4a5a6e, flatShading: true }),
  rockHot: new THREE.MeshLambertMaterial({ color: 0x883322, emissive: 0x551100, flatShading: true }),
  barrier: new THREE.MeshLambertMaterial({ color: 0xd83a3a }),
  barrierGlow: new THREE.MeshBasicMaterial({ color: 0xff8080 }),
  coin:    new THREE.MeshLambertMaterial({ color: 0xffd54d, emissive: 0xaa7700 }),
  star:    new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true }),
  shield:  new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.25 }),
  pylon:   new THREE.MeshLambertMaterial({ color: 0x556077 }),
  beam:    new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.85 }),
  crystal: new THREE.MeshLambertMaterial({ color: 0x7f5fff, emissive: 0x221166, flatShading: true }),
  pillar:  new THREE.MeshLambertMaterial({ color: 0x2a2f55, flatShading: true }),
  trail:   new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.65 }),
  spark:   new THREE.MeshBasicMaterial({ color: 0xffd54d }),
};
const GEO = {
  rock:    new THREE.IcosahedronGeometry(1.15, 0),
  barrier: new THREE.BoxGeometry(2.6, 2.2, 0.7),
  barrierTop: new THREE.BoxGeometry(2.8, 0.25, 0.9),
  coin:    new THREE.CylinderGeometry(0.55, 0.55, 0.18, 12),
  flame:   new THREE.ConeGeometry(0.45, 1.6, 8),
  shield:  new THREE.SphereGeometry(1.7, 12, 10),
  pylon:   new THREE.BoxGeometry(0.4, 6.4, 0.4),
  beam:    new THREE.BoxGeometry(2.4, 0.3, 0.3),
  crystal: new THREE.ConeGeometry(1.1, 4.5, 5),
  pillar:  new THREE.BoxGeometry(2.2, 9, 2.2),
  planet:  new THREE.SphereGeometry(2.6, 12, 10),
  ring:    new THREE.TorusGeometry(3.8, 0.35, 8, 24),
  trail:   new THREE.SphereGeometry(0.3, 6, 5),
  spark:   new THREE.OctahedronGeometry(0.16, 0),
};

// ---------- Yol + neon raylar ----------
const groundTiles = [];
{
  const tileGeo = new THREE.BoxGeometry(12, 0.5, 40);
  const lineGeo = new THREE.BoxGeometry(0.12, 0.06, 40);
  const railGeo = new THREE.BoxGeometry(0.3, 0.3, 40);
  for (let i = 0; i < 9; i++) {
    const t = new THREE.Mesh(tileGeo, MAT.ground);
    t.position.set(0, -0.25, -i * 40 + 20);
    for (const x of [-1.6, 1.6]) {
      const l = new THREE.Mesh(lineGeo, MAT.laneLine);
      l.position.set(x, 0.28, 0);
      t.add(l);
    }
    for (const x of [-6.2, 6.2]) {
      const r = new THREE.Mesh(railGeo, MAT.rail);
      r.position.set(x, 0.4, 0);
      t.add(r);
    }
    scene.add(t);
    groundTiles.push(t);
  }
}

// ---------- Yıldızlar ----------
{
  const pts = [];
  for (let i = 0; i < 350; i++) pts.push((Math.random() - 0.5) * 220, Math.random() * 90 + 5, -Math.random() * 280 - 10);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, MAT.star));
}

// ---------- Oyuncu roketi ----------
let player = null;
const playerGroup = new THREE.Group();
scene.add(playerGroup);
let flame, shieldMesh;

function buildRocket(def) {
  while (playerGroup.children.length) playerGroup.remove(playerGroup.children.pop());
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.body });
  const finMat = new THREE.MeshLambertMaterial({ color: def.fin });
  if (def.custom) {
    // ---- LAB roketi: her parça seçime göre farklı şekil ----
    const t = save.parts;
    const seg = t.body === 2 ? 6 : 10;                 // Hex Armor altıgen
    const bw = t.body === 1 ? 0.66 : 0.55;             // Steel Hull geniş
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.9, bw * 1.1, 2.2, seg), bodyMat));
    if (t.body >= 3) for (const y of [-0.5, 0.4]) {    // Titan/Void zırh halkaları
      const ring = new THREE.Mesh(new THREE.TorusGeometry(bw * 1.08, 0.07, 8, 16), finMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
    }
    const nh = 1.0 + t.nose * 0.3;                     // burun kademeyle uzar
    const noseMat = new THREE.MeshLambertMaterial({ color: PARTS.nose.opts[t.nose].c });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(bw * 0.9, nh, seg), noseMat);
    nose.position.y = 1.1 + nh / 2; g.add(nose);
    if (t.nose >= 3) {                                  // Neutron/Singularity parlayan uç
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: PARTS.nose.opts[t.nose].c }));
      tip.position.y = 1.1 + nh; g.add(tip);
    }
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0x99e6ff }));
    win.position.set(0, 0.5, bw * 0.85); g.add(win);
    const finN = [3, 4, 3, 5, 4][t.fins];               // kanat sayısı/boyu kademeyle
    const finS = (t.fins === 2 || t.fins === 4) ? 1.5 : 1;
    const fMat = t.fins === 4 ? new THREE.MeshBasicMaterial({ color: PARTS.fins.opts[4].c }) : new THREE.MeshLambertMaterial({ color: PARTS.fins.opts[t.fins].c });
    for (let i = 0; i < finN; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.9 * finS, 0.7 * finS), fMat);
      const a = (i / finN) * Math.PI * 2;
      fin.position.set(Math.sin(a) * bw, -1.0, Math.cos(a) * bw);
      fin.rotation.y = a; g.add(fin);
    }
    const eN = [1, 2, 3, 1, 1][t.engine];               // motor: alev sayısı/boyu
    const eS = t.engine >= 3 ? 1.6 : 1;
    const flameMat = new THREE.MeshBasicMaterial({ color: def.flame, transparent: true, opacity: 0.9 });
    for (let i = 0; i < eN; i++) {
      const f = new THREE.Mesh(GEO.flame, flameMat);
      f.position.set(eN > 1 ? (i - (eN - 1) / 2) * 0.5 : 0, -1.55 - 0.45 * eS, 0);
      f.scale.set(eS, eS, eS); f.rotation.x = Math.PI; g.add(f);
      if (i === 0) flame = f;
    }
    if (t.engine === 4) {                               // Antimatter halkası
      const er = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 8, 16), flameMat);
      er.rotation.x = Math.PI / 2; er.position.y = -1.4; g.add(er);
    }
  } else {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 2.2, 10), bodyMat);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 10), finMat);
  nose.position.y = 1.65;
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshBasicMaterial({ color: 0x99e6ff }));
  win.position.set(0, 0.5, 0.45);
  g.add(body, nose, win);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.7), finMat);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.sin(a) * 0.55, -1.0, Math.cos(a) * 0.55);
    fin.rotation.y = a;
    g.add(fin);
  }
  flame = new THREE.Mesh(GEO.flame, new THREE.MeshBasicMaterial({ color: def.flame, transparent: true, opacity: 0.9 }));
  flame.position.y = -1.9;
  flame.rotation.x = Math.PI;
  g.add(flame);
  }
  // üst seviye roketlerin özel parçaları
  if (def.boosters) {
    for (const sx of [-0.78, 0.78]) {
      const bo = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.3, 8), finMat);
      bo.position.set(sx, -0.55, 0);
      g.add(bo);
      const bf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), flame.material);
      bf.position.set(sx, -1.5, 0);
      bf.rotation.x = Math.PI;
      g.add(bf);
    }
  }
  if (def.ring) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 8, 20), finMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.2;
    g.add(ring);
  }
  if (def.glow) {
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 10),
      new THREE.MeshBasicMaterial({ color: def.body, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(glow);
  }
  shieldMesh = new THREE.Mesh(GEO.shield, MAT.shield);
  shieldMesh.visible = false;
  g.add(shieldMesh);
  g.rotation.x = -Math.PI / 2;
  playerGroup.add(g);
  player = g;
}

// ---------- Havuzlar ----------
function makePool(n, factory) {
  const pool = [];
  for (let i = 0; i < n; i++) {
    const mesh = factory(i);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, active: false });
  }
  return pool;
}
function acquire(pool) {
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) { pool[i].active = true; pool[i].mesh.visible = true; return pool[i]; }
  }
  return null;
}
function release(item) {
  item.active = false;
  item.mesh.visible = false;
  item.mesh.position.z = SPAWN_Z * 2;
}

const rockPool = makePool(26, () => new THREE.Mesh(GEO.rock, Math.random() < 0.5 ? MAT.rockA : MAT.rockB));
const barrierPool = makePool(14, () => {
  const grp = new THREE.Group();
  const b = new THREE.Mesh(GEO.barrier, MAT.barrier);
  const top = new THREE.Mesh(GEO.barrierTop, MAT.barrierGlow);
  top.position.y = 1.2;
  grp.add(b, top);
  return grp;
});
const coinPool = makePool(60, () => {
  const m = new THREE.Mesh(GEO.coin, MAT.coin);
  m.rotation.x = Math.PI / 2;
  return m;
});
// Lazer kapısı: 2 direk + yanıp sönen kiriş
const laserPool = makePool(8, () => {
  const grp = new THREE.Group();
  const pl = new THREE.Mesh(GEO.pylon, MAT.pylon); pl.position.set(-1.35, 3.2, 0);
  const pr = new THREE.Mesh(GEO.pylon, MAT.pylon); pr.position.set(1.35, 3.2, 0);
  const beam = new THREE.Mesh(GEO.beam, MAT.beam);
  grp.add(pl, pr, beam);
  return grp;
});
// Güçlendirme kapsülleri
const puGeoCore = new THREE.SphereGeometry(0.65, 10, 8);
const puGeoRing = new THREE.TorusGeometry(1.0, 0.09, 8, 20);
const puMats = {};
for (const k of PU_KEYS) puMats[k] = new THREE.MeshBasicMaterial({ color: POWERUPS[k].color });
const powerupPool = makePool(6, () => {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(puGeoCore, puMats.magnet));
  grp.add(new THREE.Mesh(puGeoRing, puMats.magnet));
  return grp;
});
function setPowerupKind(item, key) {
  item.pu = key;
  item.mesh.children[0].material = puMats[key];
  item.mesh.children[1].material = puMats[key];
}
// Yol kenarı dekorları: kristal / sütun / halkalı gezegen
const planetMats = [0xcc7755, 0x55aacc, 0x99cc55, 0xcc55aa].map(c => new THREE.MeshLambertMaterial({ color: c }));
const sceneryPool = makePool(20, i => {
  const kind = i % 3;
  if (kind === 0) return new THREE.Mesh(GEO.crystal, MAT.crystal);
  if (kind === 1) return new THREE.Mesh(GEO.pillar, MAT.pillar);
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(GEO.planet, planetMats[i % planetMats.length]));
  const ring = new THREE.Mesh(GEO.ring, MAT.pylon);
  ring.rotation.x = 1.1;
  grp.add(ring);
  grp.isPlanet = true;
  return grp;
});
// Egzoz izi
const trailPool = makePool(14, () => new THREE.Mesh(GEO.trail, MAT.trail));
// Meteor yağmuru etkinliği
MAT.meteor = new THREE.MeshLambertMaterial({ color: 0x552211, emissive: 0xff4400, flatShading: true });
const meteorPool = makePool(10, () => {
  const m = new THREE.Mesh(GEO.rock, MAT.meteor);
  m.scale.setScalar(0.7);
  return m;
});
// Hız çizgileri (yüksek hız/turbo hissi)
MAT.speedline = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
const lineGeoSpeed = new THREE.BoxGeometry(0.05, 0.05, 12);
const speedLinePool = makePool(10, () => new THREE.Mesh(lineGeoSpeed, MAT.speedline));

// ---------- UFO BOSS ----------
const boss = new THREE.Group();
{
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 0.8, 16), new THREE.MeshLambertMaterial({ color: 0x556077 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.25, 8, 24), new THREE.MeshBasicMaterial({ color: 0xff4466 }));
  rim.rotation.x = Math.PI / 2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.65 }));
  dome.position.y = 0.9;
  boss.add(disc, rim, dome);
  boss.visible = false;
  scene.add(boss);
}
// hedef işareti (kırmızı halka) + lazer kolonu
MAT.warn = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
MAT.bossBeam = new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.85 });
const warnPool = makePool(6, () => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.3, 20), MAT.warn);
  m.rotation.x = -Math.PI / 2;
  return m;
});
const bossBeamPool = makePool(6, () => new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), MAT.bossBeam));

// ---------- Yoldaş dron ----------
const droneMesh = new THREE.Group();
const droneBody = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffd54d }));
const droneRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
droneRing.rotation.x = Math.PI / 2;
droneMesh.add(droneBody, droneRing);
droneMesh.visible = false;
scene.add(droneMesh);

// Şok dalgası halkaları (güçlendirme/canlanma anında yayılan halka)
MAT.shock = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
const shockGeo = new THREE.TorusGeometry(1, 0.07, 8, 28);
const shocks = [];
for (let i = 0; i < 4; i++) {
  const m = new THREE.Mesh(shockGeo, MAT.shock);
  m.visible = false;
  scene.add(m);
  shocks.push({ mesh: m, life: 0 });
}
function shockwave(pos, colorHex) {
  for (const sh of shocks) {
    if (sh.life > 0) continue;
    sh.life = 0.45;
    sh.mesh.visible = true;
    sh.mesh.position.copy(pos);
    sh.mesh.scale.setScalar(0.4);
    MAT.shock.color.setHex(colorHex || 0xffffff);
    return;
  }
}
// Kıvılcımlar (altın toplama / kalkan kırma efekti)
const sparks = [];
{
  const goldMat = MAT.spark;
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(GEO.spark, goldMat);
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
  }
}
function sparkBurst(pos, count) {
  let n = 0;
  for (const s of sparks) {
    if (s.life > 0) continue;
    s.life = 0.4;
    s.mesh.visible = true;
    s.mesh.position.copy(pos);
    const a = Math.random() * Math.PI * 2;
    s.vx = Math.cos(a) * (3 + Math.random() * 5);
    s.vy = 2 + Math.random() * 6;
    s.vz = Math.sin(a) * 3;
    s.mesh.scale.setScalar(1);
    if (++n >= count) break;
  }
}
// Ölüm enkazı
const debrisGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
const debrisMats = [0xffa040, 0xff5533, 0xd8dce6, 0xffd54d].map(c => new THREE.MeshBasicMaterial({ color: c }));
const debris = [];
for (let i = 0; i < 26; i++) {
  const m = new THREE.Mesh(debrisGeo, debrisMats[i % debrisMats.length]);
  m.visible = false;
  scene.add(m);
  debris.push({ mesh: m, vx: 0, vy: 0, vz: 0 });
}

// ---------- Oyun durumu ----------
const S = { MENU: 0, PLAY: 1, OVER: 2, PAUSE: 3, DYING: 4, REVIVE: 5 };
let state = S.MENU;
let speed, score, runCoins, distSinceSpawn, distSinceScenery, targetLane, flyTarget, shieldLeft, elapsed;
let deathT = 0, reviveT = 0, revived = false;
const REVIVE_COST = 300;
const fx = { magnet: 0, mult: 0, shield: 0, turbo: 0 };
const runStats = { coins: 0, dist: 0, pu: 0, near: 0, maxCombo: 0, boss: 0 };
// kombo (üst üste yakın geçiş) ve etkinlikler
let combo = 0, comboT = 0;
let eventT = 30, eventActive = null, eventDur = 0, eventAlt = 0, meteorTick = 0, lineTick = 0;
let nextMile = 500;        // koşu içi kilometre taşı
let dayFirstRun = false;   // günün ilk koşusu 2x altın
let luckyReward = 0, luckyRoll = null;
// boss durumu
let bossActive = false, bossNext = 1500, bossT = 0, bossLevel = 0, bossAtkT = 0, bossIntro = 0, bossType = 0;
// aktif dron ve altın seri sesi
let droneDef = null;
let coinStreak = 0, coinStreakT = 0;
// V5: battle mode, tek kullanımlıklar, önizleme, şerit yatış vuruşu
let battleOn = false, lastBattle = false, battleWon = false, bots = [];
let itemDouble = false, rollKick = 0, previewOn = false;
const ITEMS = [
  { id: 'head',   icon: '🚀', name: 'Head Start',  desc: '+400 m instant start', price: 400 },
  { id: 'armor',  icon: '🛡️', name: 'Extra Armor', desc: '+1 armor this run',    price: 300 },
  { id: 'magnet', icon: '🧲', name: 'Mega Magnet', desc: 'Magnet for 15 s',      price: 250 },
  { id: 'double', icon: '💰', name: 'Coin Doubler',desc: '2x coins this run',    price: 500 },
];
let rocketDef = null; // resetRun'da getRocketDef() ile dolar

function snapTheme(i) {
  themeIdx = i;
  const th = THEMES[i % THEMES.length];
  themeTarget.fog.setHex(th.fog); themeTarget.ground.setHex(th.ground);
  themeTarget.rail.setHex(th.rail); themeTarget.line.setHex(th.line);
}
function applyThemeLerp(k) {
  scene.fog.color.lerp(themeTarget.fog, k);
  scene.background.lerp(themeTarget.fog, k);
  MAT.ground.color.lerp(themeTarget.ground, k);
  MAT.rail.color.lerp(themeTarget.rail, k);
  MAT.laneLine.color.lerp(themeTarget.line, k);
}

function resetRun() {
  rocketDef = getRocketDef();
  buildRocket(rocketDef);
  speed = 26; score = 0; runCoins = 0; elapsed = 0;
  distSinceSpawn = 0; distSinceScenery = 0;
  targetLane = 1; flyTarget = FLY_LOW;
  shieldLeft = rocketDef.shield + (save.drone >= 0 && DRONES[save.drone].shieldBonus ? DRONES[save.drone].shieldBonus : 0);
  shieldMesh.visible = shieldLeft > 0;
  for (const k of PU_KEYS) fx[k] = 0;
  runStats.coins = 0; runStats.dist = 0; runStats.pu = 0; runStats.near = 0; runStats.maxCombo = 0; runStats.boss = 0;
  combo = 0; comboT = 0;
  eventT = 30; eventActive = null; eventDur = 0; meteorTick = 0; lineTick = 0;
  nextMile = 500;
  campaignWon = false;
  bossActive = false; bossNext = 1500; bossT = 0; bossLevel = 0;
  boss.visible = false;
  coinStreak = 0; coinStreakT = 0;
  // dron donanımı ve perkleri
  droneDef = save.drone >= 0 ? DRONES[save.drone] : null;
  droneMesh.visible = !!droneDef;
  if (droneDef) droneBody.material.color.setHex(droneDef.color);
  deathT = 0; camShake = 0; revived = false;
  playerGroup.visible = true;
  for (const d of debris) d.mesh.visible = false;
  for (const s of sparks) { s.life = 0; s.mesh.visible = false; }
  ui.fxBar.innerHTML = '';
  playerGroup.position.set(LANES[1], FLY_LOW, 0);
  playerGroup.scale.setScalar(1);
  playerGroup.rotation.set(0, 0, 0);
  previewOn = false;
  itemDouble = false;
  rollKick = 0;
  camera.position.set(0, CAM_Y, CAM_Z);
  camera.lookAt(0, 1.0, -40);
  curFov = BASE_FOV; camera.fov = BASE_FOV; camera.updateProjectionMatrix();
  snapTheme(0); applyThemeLerp(1);
  for (const p of [rockPool, barrierPool, coinPool, powerupPool, laserPool, sceneryPool, trailPool, meteorPool, speedLinePool, warnPool, bossBeamPool]) p.forEach(it => it.active && release(it));
  for (let z = -90; z >= SPAWN_Z; z -= 55) spawnWave(z);
  for (let z = -20; z >= SPAWN_Z; z -= 16) spawnScenery(z);
}

// ---------- Spawn ----------
function spawnWave(zBase) {
  if (zBase === undefined) zBase = SPAWN_Z;
  const lanes = [0, 1, 2];
  const obstacleCount = Math.random() < 0.35 ? 2 : 1;
  for (let i = 0; i < obstacleCount; i++) {
    const li = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
    const x = LANES[li];
    const roll = Math.random();
    if (roll < 0.42) {
      const r = acquire(rockPool);
      if (r) {
        const high = Math.random() < 0.4;
        r.mesh.position.set(x, high ? FLY_HIGH : FLY_LOW, zBase - Math.random() * 12);
        r.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        const s = 0.9 + Math.random() * 0.5;
        r.mesh.scale.set(s, s, s);
        r.counted = false;
        // zorlaştıkça bazı kayalar şeritler arasında salınır
        r.moving = elapsed > 25 && Math.random() < Math.min(0.45, elapsed / 150);
        r.baseX = x; r.phase = Math.random() * 6.28;
        r.mesh.material = r.moving ? MAT.rockHot : (Math.random() < 0.5 ? MAT.rockA : MAT.rockB);
      }
    } else if (roll < 0.75 || elapsed < 18) {
      const b = acquire(barrierPool);
      if (b) {
        const high = Math.random() < 0.35;
        b.mesh.position.set(x, high ? FLY_HIGH : FLY_LOW, zBase - Math.random() * 12);
        b.counted = false;
      }
    } else {
      // lazer kapısı: kiriş alçakta ya da yüksekte, yanıp söner
      const l = acquire(laserPool);
      if (l) {
        const high = Math.random() < 0.5;
        l.mesh.position.set(x, 0, zBase - Math.random() * 12);
        l.beamY = high ? FLY_HIGH : FLY_LOW;
        l.mesh.children[2].position.y = l.beamY;
        l.phase = Math.random() * 6.28;
        l.counted = false;
      }
    }
  }
  if (Math.random() < 0.7 && lanes.length) {
    const li = lanes[Math.floor(Math.random() * lanes.length)];
    const x = LANES[li];
    const high = Math.random() < 0.3;
    for (let j = 0; j < 5; j++) {
      const c = acquire(coinPool);
      if (c) c.mesh.position.set(x, high ? FLY_HIGH : FLY_LOW, zBase - j * 3.2);
    }
  }
  if (Math.random() < 0.16 && lanes.length) {
    const p = acquire(powerupPool);
    if (p) {
      const li = lanes[Math.floor(Math.random() * lanes.length)];
      setPowerupKind(p, PU_KEYS[Math.floor(Math.random() * PU_KEYS.length)]);
      p.mesh.position.set(LANES[li], Math.random() < 0.3 ? FLY_HIGH : FLY_LOW, zBase - 22);
    }
  }
}
// Coin Rush etkinliği: 3 şerit dolusu altın
function spawnCoinRow(zBase) {
  const high = Math.random() < 0.25;
  for (const x of LANES) {
    const c = acquire(coinPool);
    if (c) c.mesh.position.set(x, high ? FLY_HIGH : FLY_LOW, zBase);
  }
}
function spawnScenery(zBase) {
  const it = acquire(sceneryPool);
  if (!it) return;
  const side = Math.random() < 0.5 ? -1 : 1;
  const m = it.mesh;
  if (m.isPlanet) {
    m.position.set(side * (16 + Math.random() * 14), 10 + Math.random() * 14, zBase);
    const s = 0.6 + Math.random() * 0.9;
    m.scale.setScalar(s);
  } else {
    m.position.set(side * (9.5 + Math.random() * 7), m.geometry === GEO.pillar ? 4.2 : 2.0, zBase);
    m.rotation.y = Math.random() * 3;
    const s = 0.7 + Math.random() * 0.8;
    m.scale.setScalar(s);
  }
}

// ---------- Girdi (V6 HIZLI PARMAKLAR: basılı tutup sürükleme) ----------
// Subway Surfers gibi: parmağı kaldırmadan sürükleyerek yön değiştir.
// Sağa sürükledikçe şerit şerit ilerler; yukarı/aşağı sürükleyince yükselir/alçalır.
let touchX = 0, touchY = 0;   // dokunuşun başladığı nokta (kısa flick için)
let refX = 0, refY = 0;       // sürüklemenin kayan referansı (adım tüketildikçe ilerler)
let dragging = false;         // parmak/fare basılı mı
let movedStep = false;        // bu sürükleme sırasında en az bir adım işlendi mi

// Ekran boyutuna göre eşikler: küçük ekranda kısa, büyük ekranda uzun mesafe.
function stepX() { return Math.max(34, window.innerWidth * 0.09); }   // bir şerit için yatay mesafe
function stepY() { return Math.max(42, window.innerHeight * 0.06); }  // yükseklik değişimi için dikey mesafe

function closeTut() {
  if (!save.tutorialDone) { save.tutorialDone = true; persist(); ui.tutorial.classList.add('hidden'); }
}

function onDown(x, y) {
  touchX = x; touchY = y; refX = x; refY = y;
  dragging = true; movedStep = false;
}

// Sürükleme sırasında: referanstan olan mesafe eşiği aşınca yön uygula ve referansı ilerlet
// (böylece parmağı kaldırmadan üst üste şerit değiştirilebilir).
function onMove(x, y) {
  if (state !== S.PLAY || !dragging) return;
  const SX = stepX(), SY = stepY();
  // Yatay: her adımda bir şerit (art arda birden çok şerit mümkün)
  let dx = x - refX, guard = 0;
  while (Math.abs(dx) >= SX && guard++ < 3) {
    const dir = dx > 0 ? 1 : -1;
    const nl = Math.max(0, Math.min(2, targetLane + dir));
    if (nl !== targetLane) { targetLane = nl; rollKick = (dir > 0 ? -1 : 1) * 0.55; SFX.swoosh(); }
    refX += dir * SX;
    dx = x - refX;
    movedStep = true; closeTut();
  }
  // Dikey: yukarı = yüksek uçuş, aşağı = alçak uçuş (aç/kapa)
  const dy = y - refY;
  if (Math.abs(dy) >= SY) {
    const nf = dy < 0 ? FLY_HIGH : FLY_LOW;
    if (nf !== flyTarget) { flyTarget = nf; SFX.swoosh(); movedStep = true; closeTut(); }
    refY = y; // adımı tüket
  }
}

// Parmak kalkınca: hiç adım işlenmediyse kısa/hızlı bir flick'i yine de yakala
function onUp(x, y) {
  dragging = false;
  if (state !== S.PLAY || movedStep) return;
  const dx = x - touchX, dy = y - touchY;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const TH = 24;
  if (adx < TH && ady < TH) return;
  closeTut();
  if (adx > ady) {
    const nl = Math.max(0, Math.min(2, targetLane + (dx > 0 ? 1 : -1)));
    if (nl !== targetLane) { targetLane = nl; rollKick = (dx > 0 ? -1 : 1) * 0.55; SFX.swoosh(); }
  } else {
    const nf = dy < 0 ? FLY_HIGH : FLY_LOW;
    if (nf !== flyTarget) { flyTarget = nf; SFX.swoosh(); }
  }
}
window.addEventListener('touchstart', e => onDown(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
window.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
window.addEventListener('touchend', e => onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY), { passive: true });
window.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
window.addEventListener('mousemove', e => { if (dragging) onMove(e.clientX, e.clientY); });
window.addEventListener('mouseup', e => onUp(e.clientX, e.clientY));
window.addEventListener('keydown', e => {
  if (state !== S.PLAY) return;
  if (e.key === 'ArrowLeft') targetLane = Math.max(0, targetLane - 1);
  if (e.key === 'ArrowRight') targetLane = Math.min(2, targetLane + 1);
  if (e.key === 'ArrowUp') flyTarget = FLY_HIGH;
  if (e.key === 'ArrowDown') flyTarget = FLY_LOW;
});

// ---------- UI ----------
const $ = id => document.getElementById(id);
const ui = {
  menu: $('menu'), garage: $('garage'), gameOver: $('gameOver'), paused: $('paused'), revive: $('revive'),
  hud: $('hud'), hudScore: $('hudScore'), hudCoins: $('hudCoins'), tapHint: $('tapHint'),
  menuBest: $('menuBest'), menuCoins: $('menuCoins'), menuRank: $('menuRank'), menuMissions: $('menuMissions'),
  giftBtn: $('giftBtn'),
  goScore: $('goScore'), goCoins: $('goCoins'), goRecord: $('goRecord'), goDist: $('goDist'), goNear: $('goNear'), goMissions: $('goMissions'),
  garageCoins: $('garageCoins'), rocketList: $('rocketList'), upgList: $('upgList'),
  trailList: $('trailList'), achList: $('achList'), droneList: $('droneList'),
  fxBar: $('fxBar'), flash: $('flash'), popups: $('popups'),
  rankBar: $('rankBar'), goHooks: $('goHooks'), luckyBtn: $('luckyBtn'),
  lucky: $('lucky'), luckyNum: $('luckyNum'), luckyClaim: $('luckyClaim'), luckyTitle: $('luckyTitle'),
  tutorial: $('tutorial'), shareBtn: $('shareBtn'), statsBox: $('statsBox'), cheatBadge: $('cheatBadge'),
  settings: $('settings'), settSound: $('settSound'), settMusic: $('settMusic'), settVib: $('settVib'),
  season: $('season'), seasonInfo: $('seasonInfo'), seasonBar: $('seasonBar'), seasonSp: $('seasonSp'),
  multi: $('multi'), boost: $('boost'), lead: $('lead'), preview: $('preview'),
  langModal: $('langModal'), nameModal: $('nameModal'), goTitle: $('goTitle'), boostList: $('boostList'),
  lab: $('lab'), lobby: $('lobby'), joinModal: $('joinModal'), campaign: $('campaign'), inviteModal: $('inviteModal'), offlineHint: $('offlineHint'),
  premiumBtn: $('premiumBtn'), tierList: $('tierList'), goSplash: $('goSplash'),
  settTutorial: $('settTutorial'), settReset: $('settReset'),
  reviveBar: $('reviveBar'), reviveCost: $('reviveCost'),
  reviveAd: $('reviveAd'), reviveYes: $('reviveYes'),
};

// Uçan puan yazıları (6'lık DOM havuzu)
const popEls = [];
for (let i = 0; i < 6; i++) {
  const d = document.createElement('div');
  d.className = 'pop';
  ui.popups.appendChild(d);
  popEls.push(d);
}
let popIdx = 0;
function popup(text, color) {
  const d = popEls[popIdx++ % popEls.length];
  d.textContent = text;
  d.style.color = color || '#ffd54d';
  d.classList.remove('go');
  void d.offsetWidth; // animasyonu yeniden tetikle
  d.classList.add('go');
}

function fmt(n) { return Math.floor(n).toLocaleString('en-US'); }

function renderMissions(el) {
  let html = '';
  for (const m of save.missions) {
    const mt = MTYPES[m.t];
    const pct = Math.min(100, Math.round((m.prog / m.target) * 100));
    html += '<div class="mItem' + (pct >= 100 ? ' done' : '') + '">' +
      '<div class="mTxt"><span>' + mt.txt(fmt(m.target)) + '</span><span class="rw">🪙 ' + fmt(m.reward) + '</span></div>' +
      '<div class="mBarO"><div class="mBar" style="width:' + pct + '%"></div></div></div>';
  }
  el.innerHTML = html;
}

function showMenu() {
  state = S.MENU;
  ui.menuBest.textContent = fmt(save.best);
  ui.menuCoins.textContent = fmt(save.coins);
  const r = rankOf(save.xp);
  const myBadge = badgeOf(save.name);
  ui.menuRank.innerHTML = (myBadge ? '<span class="fbadge ' + myBadge.cls + '">' + myBadge.icon + '</span><b class="fname ' + myBadge.cls + '">' + myBadge.label + '</b> · ' : '') +
    '🎖️ <b>' + r.name + '</b> · ' + fmt(save.xp) + ' m' +
    (r.next ? ' <span style="color:#7f8ac8">(next: ' + fmt(r.next[0]) + ' m)</span>' : '') +
    ' · 🏅 ' + save.ach.length + '/' + ACH.length;
  // rütbe ilerleme çubuğu (hep gözde: "az kaldı" hissi)
  const curTh = RANKS.filter(x => save.xp >= x[0]).pop()[0];
  ui.rankBar.style.width = (r.next ? Math.min(100, ((save.xp - curTh) / (r.next[0] - curTh)) * 100) : 100) + '%';
  renderMissions(ui.menuMissions);
  ui.offlineHint.classList.toggle('hidden', FB.ok || !FB.cfg());
  // günlük seri hediyesi: üst üste her gün daha büyük ödül
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (save.lastGift !== today) {
    const nextStreak = save.lastGift === yesterday ? save.streak + 1 : 1;
    const reward = STREAK_REWARDS[Math.min(nextStreak - 1, STREAK_REWARDS.length - 1)];
    ui.giftBtn.textContent = '🎁 Day ' + nextStreak + ' Streak: +' + fmt(reward);
    ui.giftBtn.classList.remove('hidden');
  } else {
    ui.giftBtn.classList.add('hidden');
  }
  ui.menu.classList.remove('hidden');
  battleOn = false;
  applyTexts();
  for (const el of [ui.garage, ui.gameOver, ui.paused, ui.revive, ui.lucky, ui.settings, ui.season, ui.multi, ui.boost, ui.lead, ui.preview, ui.lab, ui.lobby, ui.joinModal, ui.campaign, ui.inviteModal, ui.langModal, ui.nameModal, ui.hud, ui.tapHint]) el.classList.add('hidden');
  resetRun();
}

function beginRun(battle) {
  initAudio(); SFX.ui();
  resetRun();
  battleOn = !!battle;
  lastBattle = battleOn;
  battleWon = false;
  if (battleOn) {
    bots = [];
    const used = new Set();
    while (bots.length < 7) {
      const n = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + (Math.random() < 0.4 ? Math.floor(Math.random() * 99) : '');
      if (used.has(n)) continue;
      used.add(n);
      bots.push({ name: n, cc: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)], alive: true, deathAt: 12 + Math.pow(Math.random(), 1.6) * 95 });
    }
  } else {
    // seçilen tek kullanımlıkları uygula ve tüket
    for (const it of ITEMS) {
      const cb = document.querySelector('#boostRows input[data-b="' + it.id + '"]');
      if (!cb || !cb.checked || !save.items[it.id]) continue;
      save.items[it.id]--;
      if (it.id === 'head') { runStats.dist += 400; score += 400; elapsed = 10; nextMile = 500; }
      if (it.id === 'armor') { shieldLeft++; shieldMesh.visible = true; }
      if (it.id === 'magnet') fx.magnet = 15;
      if (it.id === 'double') itemDouble = true;
    }
    persist();
  }
  // günün ilk koşusu: 2x altın (her gün ilk açılışta oynamaya çağırır)
  const today = new Date().toDateString();
  dayFirstRun = save.firstRun !== today;
  if (dayFirstRun) {
    save.firstRun = today;
    persist();
    setTimeout(() => popup('☀️ ' + T('firstrun'), '#ffe07a'), 800);
  }
  // kampanya bölümü aktifse hedefi duyur
  if (campaignRun >= 0) {
    const lv = CAMPAIGN[campaignRun];
    setTimeout(() => popup('🎯 ' + lv.t(fmt(lv.target)), '#9fd4ff'), 900);
  }
  // ONBOARDING: ilk 2 koşu daha yavaş başlar (yeni oyuncu 10 sn'de ölmesin)
  save.playCount++; persist();
  state = S.PLAY;
  for (const el of [ui.menu, ui.gameOver, ui.paused, ui.revive, ui.lucky, ui.multi, ui.boost, ui.lead]) el.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.tapHint.classList.remove('hidden');
  ui.tapHint.style.opacity = 1;
  setTimeout(() => { ui.tapHint.style.opacity = 0; }, 3500);
  // ilk oyunda eğitim katmanı (ilk kaydırmayla kapanır)
  if (!save.tutorialDone) ui.tutorial.classList.remove('hidden');
  // GO! açılış yazısı
  ui.goSplash.textContent = 'GO!';
  ui.goSplash.classList.remove('go');
  void ui.goSplash.offsetWidth;
  ui.goSplash.classList.add('go');
}

// ---------- Ölüm & canlanma ----------
function startDeath() {
  state = S.DYING;
  deathT = 0;
  camShake = 1.4;
  playerGroup.visible = false;
  SFX.crash(); vib([60, 40, 120]);
  const p = playerGroup.position;
  for (const d of debris) {
    d.mesh.visible = true;
    d.mesh.position.set(p.x, p.y, p.z);
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI;
    const sp = 6 + Math.random() * 12;
    d.vx = Math.sin(b) * Math.cos(a) * sp;
    d.vy = Math.abs(Math.cos(b)) * sp * 0.9 + 3;
    d.vz = Math.sin(b) * Math.sin(a) * sp * 0.6;
    d.mesh.scale.setScalar(0.8 + Math.random() * 1.2);
    d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  }
  ui.flash.style.transition = 'none';
  ui.flash.style.opacity = '0.95';
  requestAnimationFrame(() => {
    ui.flash.style.transition = 'opacity .5s ease-out';
    ui.flash.style.opacity = '0';
  });
  ui.fxBar.innerHTML = '';
  ui.tapHint.classList.add('hidden');
  ui.tutorial.classList.add('hidden'); // eğitim ölüm/oyun sonu ekranına sarkmasın
  droneMesh.visible = false;           // dron patlamada havada asılı kalmasın
}

function offerRevive() {
  state = S.REVIVE;
  reviveT = 5;
  ui.reviveCost.textContent = fmt(REVIVE_COST);
  // reklam hazırsa bedava canlanma butonu, altın yetiyorsa altınla canlanma
  ui.reviveAd.classList.toggle('hidden', !Ads.rewardedReady());
  ui.reviveYes.classList.toggle('hidden', save.coins < REVIVE_COST);
  ui.revive.classList.remove('hidden');
}
function doRevive(free) {
  if (!free) {
    save.coins -= REVIVE_COST;
    persist();
  }
  revived = true;
  SFX.revive(); vib(40);
  ui.revive.classList.add('hidden');
  // önündeki tehlikeleri temizle, kısa koruma ver
  for (const p of [rockPool, barrierPool, laserPool, warnPool, bossBeamPool, meteorPool]) p.forEach(it => { if (it.active && it.mesh.position.z > -80) release(it); });
  for (const d of debris) d.mesh.visible = false;
  playerGroup.visible = true;
  droneMesh.visible = !!droneDef; // dron canlanmada geri gelsin
  shockwave(playerGroup.position, 0x66ccff);
  fx.shield = Math.max(fx.shield, 2.5);
  popup('GO! 🚀', '#9dff70');
  state = S.PLAY;
}

function gameOver() {
  state = S.OVER;
  Ads.maybeShowInterstitial();
  // battle sıralaması ve ödülü
  if (battleOn) {
    const total = bots.length + 1;
    const aliveBots = bots.filter(b => b.alive).length;
    const placement = battleWon ? 1 : aliveBots + 1;
    const rewards = [0, 1500, 800, 500, 300, 200, 150, 100, 50];
    const br = rewards[Math.min(placement, 8)] || 50;
    runCoins += br;
    runStats.coins += br;
    ui.goTitle.textContent = placement === 1 ? '🏆 ' + T('winner') : '💀 ' + T('eliminated') + ' · #' + placement + '/' + total;
    // odada: son durumu yaz, senkronu durdur (rakipler bizi 'bitti' görsün)
    if (mp.code && FB.ok) { mpWriteMe({ dist: Math.floor(runStats.dist), alive: false, done: true }); if (mp.sync) clearInterval(mp.sync), mp.sync = null; }
  } else if (campaignWon) {
    ui.goTitle.textContent = '🏆 ' + T('leveldone');
  } else {
    ui.goTitle.textContent = T('gameover');
  }
  // Coiny dronu: koşu sonu altınlarına +%10
  if (droneDef && droneDef.coinBonus && runCoins > 0) {
    const bonus = Math.max(1, Math.round(runCoins * droneDef.coinBonus));
    runCoins += bonus;
    runStats.coins += bonus;
  }
  const sc = Math.floor(score);
  const record = sc > save.best;
  if (record) save.best = sc;
  save.coins += runCoins;
  save.xp += Math.floor(runStats.dist);
  // ömürlük istatistikler (başarımlar için)
  save.stats.runs++;
  save.stats.coins += runStats.coins;
  save.stats.dist += Math.floor(runStats.dist);
  save.stats.near += runStats.near;
  save.stats.pu += runStats.pu;
  save.stats.boss += runStats.boss;
  if (runStats.maxCombo > save.stats.maxCombo) save.stats.maxCombo = runStats.maxCombo;
  // en iyi 5 koşu
  save.top5.push({ s: sc, d: Math.floor(runStats.dist) });
  save.top5.sort((a, b) => b.s - a.s);
  save.top5 = save.top5.slice(0, 5);
  // sezon puanı: skor + boss + görevler
  ensureSeason();
  const spGain = Math.max(5, Math.floor(sc / 150)) + runStats.boss * 25;
  save.season.sp += spGain;
  // görev ilerlemesi
  const doneMsgs = [];
  save.missions = save.missions.map(m => {
    const mt = MTYPES[m.t];
    const v = runStats[mt.stat];
    if (mt.run) { if (v > m.prog) m.prog = v; }
    else m.prog += v;
    if (m.prog >= m.target) {
      save.coins += m.reward;
      doneMsgs.push(mt.txt(fmt(m.target)) + ' → +🪙' + fmt(m.reward));
      return newMission(m.t, m.tier + 1);
    }
    return m;
  });
  if (record) FB.submit(); // gerçek skor tablosuna yolla (varsa)
  if (!battleOn) FB.submitTournament(sc); // günlük/haftalık turnuva
  FB.cloudSave(); // her koşu sonunda buluta yedekle
  const achMsgs = checkAch();
  // Lucky Box hakkı: her 3 koşuda bir
  save.boxRuns++;
  if (save.boxRuns >= BOX_EVERY) { save.boxRuns = 0; save.box = true; }
  persist();
  // skor 0'dan sayarak dolar
  if (window.__goCount) clearInterval(window.__goCount);
  {
    const t0 = performance.now(), dur = 900;
    window.__goCount = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      ui.goScore.textContent = fmt(sc * e);
      if (k >= 1) { clearInterval(window.__goCount); window.__goCount = null; }
    }, 30);
  }
  ui.goDist.textContent = fmt(runStats.dist) + ' m';
  ui.goCoins.textContent = '🪙 ' + fmt(runCoins);
  ui.goNear.textContent = fmt(runStats.near);
  // rekora ramak kaldıysa söyle (bir koşu daha oynatan en güçlü cümle)
  let recLine = '';
  if (record) recLine = '🏆 ' + T('newrecord') + '  ';
  else if (save.best > 0 && sc >= save.best * 0.8) {
    recLine = '🔥 ' + T('soclose') + ' ' + Math.floor((sc / save.best) * 100) + '%  ';
  }
  ui.goRecord.textContent = recLine +
    (doneMsgs.length ? '✅ ' + doneMsgs.join(' · ') + '  ' : '') +
    (achMsgs.length ? '🏅 ' + achMsgs.join(' · ') : '');
  // "bir koşu daha" kancaları: sıradaki rütbe + en yakın görev
  const rr = rankOf(save.xp);
  let hooks = [];
  if (rr.next) hooks.push('🎖️ ' + fmt(rr.next[0] - save.xp) + ' m to ' + rr.next[1]);
  let bestPct = 0;
  for (const m of save.missions) bestPct = Math.max(bestPct, Math.min(99, Math.floor((m.prog / m.target) * 100)));
  if (bestPct >= 40) hooks.push('📋 Mission ' + bestPct + '% done');
  hooks.unshift('🎫 +' + fmt(spGain) + ' SP');
  hooks.push('🎁 Lucky Box: ' + (save.box ? 'READY!' : (BOX_EVERY - save.boxRuns) + ' run' + (BOX_EVERY - save.boxRuns > 1 ? 's' : '') + ' away'));
  ui.goHooks.textContent = hooks.join('  ·  ');
  ui.luckyBtn.classList.toggle('hidden', !save.box);
  if (doneMsgs.length) SFX.mission();
  renderMissions(ui.goMissions);
  ui.hud.classList.add('hidden');
  ui.revive.classList.add('hidden');
  ui.gameOver.classList.remove('hidden');
}

function renderGarage() {
  ui.garageCoins.textContent = '🪙 ' + fmt(save.coins);
  ui.rocketList.innerHTML = '';
  ROCKETS.forEach((r, i) => {
    const owned = save.owned.includes(i);
    const sel = save.selected === i;
    const card = document.createElement('div');
    card.className = 'rocketCard' + (owned ? ' owned' : '') + (sel ? ' selected' : '');
    const seasonal = r.price < 0 && !owned;
    const btnLabel = sel ? T('selected') : owned ? T('select') : seasonal ? '🎫 PASS' : '🪙 ' + fmt(r.price);
    const btnClass = sel ? 'rocketBtn sel' : owned ? 'rocketBtn' : (!seasonal && save.coins >= r.price ? 'rocketBtn' : 'rocketBtn locked');
    card.innerHTML =
      '<div class="rocketIcon">' + r.icon + '</div>' +
      '<div class="rocketInfo"><div class="rocketName">' + r.name + '</div>' +
      '<div class="rocketDesc">' + r.desc + '</div></div>' +
      '<button class="' + btnClass + '" data-i="' + i + '">' + btnLabel + '</button>';
    card.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') showPreview('rocket', i); });
    ui.rocketList.appendChild(card);
  });
  ui.rocketList.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const i = +b.dataset.i;
      const r = ROCKETS[i];
      if (save.owned.includes(i)) { save.selected = i; SFX.ui(); }
      else if (r.price >= 0 && save.coins >= r.price) {
        save.coins -= r.price;
        save.owned.push(i);
        save.selected = i;
        SFX.buy(); vib(30);
        checkAch();
      }
      persist();
      renderGarage();
    });
  });
  ui.upgList.innerHTML = '';
  PU_KEYS.forEach(k => {
    const p = POWERUPS[k];
    const lv = save.upg[k];
    const maxed = lv >= UPG_MAX;
    const price = maxed ? 0 : UPG_PRICES[lv];
    let pips = '';
    for (let i = 0; i < UPG_MAX; i++) pips += '<span class="' + (i < lv ? 'on' : 'off') + '">●</span>';
    const card = document.createElement('div');
    card.className = 'rocketCard' + (lv > 0 ? ' owned' : '');
    card.innerHTML =
      '<div class="rocketIcon">' + p.icon + '</div>' +
      '<div class="rocketInfo"><div class="rocketName">' + p.name + '</div>' +
      '<div class="rocketDesc">' + p.desc + ' — duration: ' + puDuration(k).toFixed(1) + 's</div>' +
      '<div class="pips">' + pips + '</div></div>' +
      '<button class="' + (maxed ? 'rocketBtn sel' : (save.coins >= price ? 'rocketBtn' : 'rocketBtn locked')) + '" data-k="' + k + '">' +
      (maxed ? 'MAX' : '🪙 ' + fmt(price)) + '</button>';
    ui.upgList.appendChild(card);
  });
  ui.upgList.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.k;
      const lv = save.upg[k];
      if (lv >= UPG_MAX) return;
      const price = UPG_PRICES[lv];
      if (save.coins >= price) {
        save.coins -= price;
        save.upg[k] = lv + 1;
        SFX.buy(); vib(30);
        checkAch();
        persist();
        renderGarage();
      }
    });
  });

  // İz mağazası
  ui.trailList.innerHTML = '';
  TRAILS.forEach((t, i) => {
    const owned = save.trailOwned.includes(i);
    const sel = save.trail === i;
    const card = document.createElement('div');
    card.className = 'rocketCard' + (owned ? ' owned' : '') + (sel ? ' selected' : '');
    const dotStyle = t.rainbow
      ? 'background:linear-gradient(135deg,#ff5555,#ffaa33,#ffee55,#66ee66,#55aaff,#cc66ff)'
      : 'background:#' + t.color.toString(16).padStart(6, '0');
    const tSeason = t.price < 0 && !owned;
    card.innerHTML =
      '<div class="trailDot" style="' + dotStyle + '"></div>' +
      '<div class="rocketInfo"><div class="rocketName">' + t.name + '</div></div>' +
      '<button class="' + (sel ? 'rocketBtn sel' : owned ? 'rocketBtn' : (!tSeason && save.coins >= t.price ? 'rocketBtn' : 'rocketBtn locked')) + '" data-t="' + i + '">' +
      (sel ? T('selected') : owned ? T('select') : tSeason ? '🎫 PASS' : '🪙 ' + fmt(t.price)) + '</button>';
    card.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') showPreview('trail', i); });
    ui.trailList.appendChild(card);
  });
  ui.trailList.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const i = +b.dataset.t;
      if (save.trailOwned.includes(i)) { save.trail = i; SFX.ui(); }
      else if (TRAILS[i].price >= 0 && save.coins >= TRAILS[i].price) {
        save.coins -= TRAILS[i].price;
        save.trailOwned.push(i);
        save.trail = i;
        SFX.buy(); vib(30);
      }
      persist();
      renderGarage();
    });
  });

  // Dron mağazası
  ui.droneList.innerHTML = '';
  DRONES.forEach((d, i) => {
    const owned = save.droneOwned.includes(i);
    const sel = save.drone === i;
    const card = document.createElement('div');
    card.className = 'rocketCard' + (owned ? ' owned' : '') + (sel ? ' selected' : '');
    const dSeason = d.price < 0 && !owned;
    card.innerHTML =
      '<div class="trailDot" style="background:#' + d.color.toString(16).padStart(6, '0') + '"></div>' +
      '<div class="rocketInfo"><div class="rocketName">' + d.icon + ' ' + d.name + '</div>' +
      '<div class="rocketDesc">' + d.desc + (sel ? ' — tap to unequip' : '') + '</div></div>' +
      '<button class="' + (sel ? 'rocketBtn sel' : owned ? 'rocketBtn' : (!dSeason && save.coins >= d.price ? 'rocketBtn' : 'rocketBtn locked')) + '" data-d="' + i + '">' +
      (sel ? T('equipped') : owned ? T('equip') : dSeason ? '🎫 PASS' : '🪙 ' + fmt(d.price)) + '</button>';
    card.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') showPreview('drone', i); });
    ui.droneList.appendChild(card);
  });
  ui.droneList.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const i = +b.dataset.d;
      if (save.drone === i) { save.drone = -1; SFX.ui(); }
      else if (save.droneOwned.includes(i)) { save.drone = i; SFX.ui(); }
      else if (DRONES[i].price >= 0 && save.coins >= DRONES[i].price) {
        save.coins -= DRONES[i].price;
        save.droneOwned.push(i);
        save.drone = i;
        SFX.buy(); vib(30);
      }
      persist();
      renderGarage();
    });
  });

  // Tek kullanımlık güçlendirmeler
  ui.boostList.innerHTML = '';
  ITEMS.forEach(it => {
    const c = save.items[it.id] || 0;
    const card = document.createElement('div');
    card.className = 'rocketCard' + (c > 0 ? ' owned' : '');
    card.innerHTML =
      '<div class="rocketIcon">' + it.icon + '</div>' +
      '<div class="rocketInfo"><div class="rocketName">' + it.name + (c > 0 ? ' <span style="color:#ffd54d">x' + c + '</span>' : '') + '</div>' +
      '<div class="rocketDesc">' + it.desc + '</div></div>' +
      '<button class="' + (save.coins >= it.price ? 'rocketBtn' : 'rocketBtn locked') + '" data-it="' + it.id + '">' + T('buy') + ' 🪙 ' + fmt(it.price) + '</button>';
    ui.boostList.appendChild(card);
  });
  ui.boostList.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const it = ITEMS.find(x => x.id === b.dataset.it);
      if (save.coins < it.price) return;
      save.coins -= it.price;
      save.items[it.id] = (save.items[it.id] || 0) + 1;
      SFX.buy(); vib(25);
      persist();
      renderGarage();
    });
  });

  // Ömürlük istatistikler
  const st = save.stats;
  let top5Html = '';
  save.top5.forEach((r, i) => {
    top5Html += '<div class="statLine"><span>🏆 #' + (i + 1) + '</span><b>' + fmt(r.s) + ' <span style="color:#9fb4ff;font-weight:600;">(' + fmt(r.d) + ' m)</span></b></div>';
  });
  ui.statsBox.innerHTML = top5Html +
    '<div class="statLine"><span>🏃 Total runs</span><b>' + fmt(st.runs) + '</b></div>' +
    '<div class="statLine"><span>🛣️ Total distance</span><b>' + fmt(st.dist) + ' m</b></div>' +
    '<div class="statLine"><span>🪙 Coins collected</span><b>' + fmt(st.coins) + '</b></div>' +
    '<div class="statLine"><span>😱 Near misses</span><b>' + fmt(st.near) + '</b></div>' +
    '<div class="statLine"><span>🔥 Best combo</span><b>x' + fmt(st.maxCombo) + '</b></div>' +
    '<div class="statLine"><span>⚡ Power-ups used</span><b>' + fmt(st.pu) + '</b></div>' +
    '<div class="statLine"><span>👽 Bosses survived</span><b>' + fmt(st.boss) + '</b></div>' +
    '<div class="statLine"><span>🏆 Best score</span><b>' + fmt(save.best) + '</b></div>';

  // Başarımlar
  ui.achList.innerHTML = '';
  ACH.forEach(a => {
    const got = save.ach.includes(a.id);
    const card = document.createElement('div');
    card.className = 'rocketCard' + (got ? ' owned' : '');
    card.style.opacity = got ? '1' : '0.55';
    card.innerHTML =
      '<div class="rocketIcon">' + (got ? a.icon : '🔒') + '</div>' +
      '<div class="rocketInfo"><div class="rocketName">' + a.name + '</div>' +
      '<div class="rocketDesc">' + a.desc + '</div></div>' +
      '<div style="font-weight:900;color:' + (got ? '#9dff70' : '#ffd54d') + ';font-size:3.8vw;white-space:nowrap;">' +
      (got ? '✓ DONE' : '🪙 ' + ACH_REWARD) + '</div>';
    ui.achList.appendChild(card);
  });
}

// ---------- Lucky Box: slot makinesi tarzı sayı dönmesi ----------
function openLuckyBox() {
  if (!save.box) return;
  save.box = false;
  persist();
  luckyReward = rollLuckyBox();
  ui.gameOver.classList.add('hidden');
  ui.lucky.classList.remove('hidden');
  ui.luckyClaim.classList.add('hidden');
  ui.luckyTitle.textContent = '🎁 LUCKY BOX';
  let t = 0;
  const totalT = 1800; // 1,8 sn heyecan
  luckyRoll = setInterval(() => {
    t += 60;
    // sona yaklaştıkça yavaşlayan sahte rulet
    if (t < totalT) {
      ui.luckyNum.textContent = '🪙 ' + fmt(rollLuckyBox());
      if (t % 180 < 60) SFX.ui();
    } else {
      clearInterval(luckyRoll);
      luckyRoll = null;
      ui.luckyNum.textContent = '🪙 ' + fmt(luckyReward);
      if (luckyReward >= 10000) {
        ui.luckyTitle.textContent = '💎 JACKPOT!!!';
        SFX.mission(); setTimeout(SFX.mission, 200); setTimeout(SFX.buy, 400);
        vib([80, 60, 80, 60, 200]);
      } else if (luckyReward >= 2500) {
        ui.luckyTitle.textContent = '🌟 BIG WIN!';
        SFX.buy(); vib(60);
      } else {
        SFX.buy(); vib(25);
      }
      ui.luckyClaim.classList.remove('hidden');
    }
  }, 60);
}
$('luckyBtn').addEventListener('click', () => { initAudio(); openLuckyBox(); });
$('luckyClaim').addEventListener('click', () => {
  save.coins += luckyReward;
  persist();
  popup('+🪙 ' + fmt(luckyReward) + '!', '#ffd54d');
  ui.lucky.classList.add('hidden');
  ui.gameOver.classList.remove('hidden');
  ui.luckyBtn.classList.add('hidden');
});

// koşu hazırlığı: tek kullanımlık varsa sor, yoksa direkt başla
function prepRun(battle) {
  if (!battle) campaignRun = -1; // normal koşu
  if (battle) { beginRun(true); return; }
  const anyItem = ITEMS.some(it => save.items[it.id] > 0);
  if (!anyItem) { beginRun(false); return; }
  // booster seçim ekranı
  let rows = '';
  for (const it of ITEMS) {
    const c = save.items[it.id];
    if (!c) continue;
    rows += '<label class="settRow" style="cursor:pointer;"><div><div class="lbl">' + it.icon + ' ' + it.name + ' <span style="color:#ffd54d">x' + c + '</span></div>' +
      '<div class="sub">' + it.desc + '</div></div><input type="checkbox" data-b="' + it.id + '" style="width:7vw;height:7vw;"></label>';
  }
  $('boostRows').innerHTML = rows;
  ui.menu.classList.add('hidden');
  ui.gameOver.classList.add('hidden');
  ui.boost.classList.remove('hidden');
}
$('playBtn').addEventListener('click', () => prepRun(false));
$('retryBtn').addEventListener('click', () => { if (campaignRun >= 0) beginRun(false); else prepRun(lastBattle); });
$('boostStart').addEventListener('click', () => { ui.boost.classList.add('hidden'); beginRun(false); });
$('boostX').addEventListener('click', showMenu);

// ---- çok oyunculu (yapay zekâ rakipli) ----
$('multiBtn').addEventListener('click', () => {
  initAudio(); SFX.ui();
  ui.menu.classList.add('hidden');
  ui.multi.classList.remove('hidden');
  $('matchList').innerHTML = '';
  // gerçek oda butonları sadece çevrimiçiyken
  $('createRoomBtn').classList.toggle('hidden', !FB.ok);
  $('joinRoomBtn').classList.toggle('hidden', !FB.ok);
  $('roomHint').textContent = FB.ok ? '' : T('online_soon');
});
$('multiX').addEventListener('click', () => { mpLeave(); showMenu(); });

// ---- Hızlı Maç: yapay rakipler (her zaman çalışır) ----
$('quickBtn').addEventListener('click', () => {
  SFX.ui(); campaignRun = -1;
  const list = $('matchList');
  list.innerHTML = '<div class="statLine"><span>' + T('finding') + '</span><b>…</b></div>';
  const names = [], used = new Set();
  while (names.length < 7) { const n = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; if (!used.has(n)) { used.add(n); names.push(n); } }
  let i = 0;
  const iv = setInterval(() => {
    if (i < 7) { list.innerHTML += '<div class="statLine"><span>' + flagOf(COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)]) + ' ' + names[i] + '</span><b style="color:#9dff70">✓</b></div>'; SFX.ui(); i++; }
    else { clearInterval(iv); setTimeout(() => beginRun(true), 500); }
  }, 280);
});

// ================= GERÇEK ODALAR (Firestore) =================
const mp = { code: null, host: false, seed: 0, poll: null, sync: null, started: false };
function mpRoomPath() { return 'rooms/' + mp.code; }
function mpGenCode() { const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 4; i++) c += cs[Math.floor(Math.random() * cs.length)]; return c; }
function mpLeave() {
  if (mp.poll) clearInterval(mp.poll), mp.poll = null;
  if (mp.sync) clearInterval(mp.sync), mp.sync = null;
  if (mp.code && FB.ok) { FB.del(mpRoomPath() + '/players/' + FB.uid); if (mp.host) FB.del(mpRoomPath()); }
  mp.code = null; mp.host = false; mp.started = false;
}
async function mpWriteMe(extra) {
  await FB.put(mpRoomPath() + '/players/' + FB.uid, Object.assign({ name: (save.name || 'Pilot').slice(0, 12), country: save.country || 'US', dist: 0, alive: true, done: false }, extra || {}));
}
$('createRoomBtn').addEventListener('click', async () => {
  if (!FB.ok) return;
  SFX.ui();
  mp.code = mpGenCode(); mp.host = true; mp.seed = Math.floor(Math.random() * 1e9); mp.started = false;
  await FB.put(mpRoomPath(), { host: FB.uid, seed: mp.seed, state: 'lobby', ts: Date.now() });
  await mpWriteMe();
  openLobby();
});
$('joinRoomBtn').addEventListener('click', () => { $('joinInput').value = ''; ui.joinModal.classList.remove('hidden'); });
$('joinX').addEventListener('click', () => ui.joinModal.classList.add('hidden'));
$('joinGo').addEventListener('click', async () => {
  const code = ($('joinInput').value || '').toUpperCase().trim();
  if (code.length !== 4 || !FB.ok) return;
  const room = await FB.get('rooms/' + code);
  if (!room) { $('joinErr').textContent = T('roomnf'); SFX.near(); return; }
  mp.code = code; mp.host = (room.host === FB.uid); mp.seed = room.seed || 0; mp.started = false;
  await mpWriteMe();
  ui.joinModal.classList.add('hidden');
  SFX.buy();
  openLobby();
});
function openLobby() {
  ui.multi.classList.add('hidden');
  ui.lobby.classList.remove('hidden');
  $('lobbyCode').textContent = mp.code;
  $('lobbyStart').classList.toggle('hidden', !mp.host);
  $('lobbyWait').classList.toggle('hidden', mp.host);
  if (mp.poll) clearInterval(mp.poll);
  mp.poll = setInterval(pollLobby, 1500);
  pollLobby();
}
async function pollLobby() {
  if (!mp.code) return;
  const room = await FB.get(mpRoomPath());
  if (!room && !mp.host) { // oda kapandı
    clearInterval(mp.poll); mp.poll = null; mp.code = null;
    ui.lobby.classList.add('hidden'); ui.multi.classList.remove('hidden');
    return;
  }
  const players = await FB.list(mpRoomPath() + '/players');
  let html = '';
  for (const p of players) html += '<div class="statLine"><span>' + flagOf(p.country) + ' ' + nameHTML(p.name, p.id === FB.uid ? '#ffd54d' : null) + '</span><b style="color:#9dff70">✓</b></div>';
  $('lobbyList').innerHTML = html;
  $('lobbyCount').textContent = players.length + '/8';
  // misafir: host başlattıysa yarışa gir
  if (!mp.host && room && room.state === 'racing' && !mp.started) {
    mp.seed = room.seed || mp.seed;
    beginRoomRun(players);
  }
}
$('lobbyStart').addEventListener('click', async () => {
  if (!mp.host) return;
  SFX.buy();
  const players = await FB.list(mpRoomPath() + '/players');
  await FB.put(mpRoomPath(), { state: 'racing', started: Date.now() });
  beginRoomRun(players);
});
$('lobbyX').addEventListener('click', () => { mpLeave(); ui.lobby.classList.add('hidden'); showMenu(); });

function beginRoomRun(players) {
  if (mp.started) return;
  campaignRun = -1;
  mp.started = true;
  if (mp.poll) clearInterval(mp.poll), mp.poll = null;
  ui.lobby.classList.add('hidden');
  beginRun(true); // battle modu
  // rakip listesini gerçek oyunculardan kur (+ az kişi varsa yapay doldur)
  bots = [];
  for (const p of players) {
    if (p.id === FB.uid) continue;
    bots.push({ name: p.name, cc: p.country, alive: true, done: false, dist: 0, real: true, uid: p.id });
  }
  while (bots.length < 3) { // en az 4 kişilik his için yapay doldur
    const n = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    bots.push({ name: n, cc: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)], alive: true, deathAt: 20 + Math.pow(Math.random(), 1.6) * 90 });
  }
  // canlı senkron: kendi mesafeni yaz, rakipleri oku
  if (mp.sync) clearInterval(mp.sync);
  mp.sync = setInterval(mpSync, 1300);
}
async function mpSync() {
  if (!mp.code || !FB.ok) return;
  await mpWriteMe({ dist: Math.floor(runStats.dist), alive: state === S.PLAY, done: state !== S.PLAY });
  const players = await FB.list(mpRoomPath() + '/players');
  for (const b of bots) {
    if (!b.real) continue;
    const p = players.find(x => x.id === b.uid);
    if (p) { b.dist = p.dist || 0; b.done = !!p.done; }
    else b.done = true; // ayrıldıysa elenmiş say
  }
}

// ---- skor tablosu ----
let leadTab = 'world'; // world | country | daily | weekly
function renderLead(liveRows) {
  for (const t of ['world', 'country', 'daily', 'weekly']) $('leadTab_' + t).classList.toggle('on', leadTab === t);
  const tourn0 = leadTab === 'daily' || leadTab === 'weekly';
  let rows, live = false;
  // çevrimiçi + turnuva sekmesi boş olsa bile (henüz kimse skor atmamış) canlı say, sadece oyuncuyu göster
  if ((liveRows && liveRows.length) || (FB.ok && tourn0 && Array.isArray(liveRows))) {
    live = true;
    liveRows = liveRows || [];
    rows = leadTab === 'country' ? liveRows.filter(r => r.cc === (save.country || 'US')) : liveRows.slice();
    const meScore = (leadTab === 'daily' || leadTab === 'weekly') ? (window.__tournMe || 0) : save.best;
    if (!rows.some(r => r.me)) rows.push({ name: save.name || 'You', cc: save.country || 'US', s: meScore, me: true });
    rows.sort((a, b) => b.s - a.s);
    rows = rows.slice(0, 50);
  } else {
    rows = genBoard(leadTab !== 'country'); // çevrimdışı: yapay liste
  }
  const tourn = leadTab === 'daily' || leadTab === 'weekly';
  $('leadLive').textContent = live ? (tourn ? '🏆 ' + (leadTab === 'daily' ? T('daily') : T('weekly')) : '🌐 LIVE') : '📡 OFFLINE';
  $('leadLive').style.color = live ? '#9dff70' : '#7f8ac8';
  let html = '';
  rows.forEach((r, i) => {
    const medal = tourn && i < 3 ? ['🥇', '🥈', '🥉'][i] + ' ' : '';
    html += '<div class="statLine" style="' + (r.me ? 'border:2px solid #ffd54d;background:rgba(70,55,10,.8);' : '') + '">' +
      '<span>' + (medal || '#' + (i + 1) + ' ') + flagOf(r.cc) + ' ' + (r.me ? nameHTML(save.name || T('you'), '#ffd54d') : nameHTML(r.name)) + '</span>' +
      '<b>' + fmt(r.s) + '</b></div>';
  });
  $('leadList').innerHTML = html || '<div class="statLine"><span>' + T('finding') + '</span></div>';
}
function refreshLead() {
  renderLead(leadTab === 'daily' || leadTab === 'weekly' ? window.__tournRows : FB.rows);
  if (leadTab === 'daily' || leadTab === 'weekly') {
    FB.fetchTournament(leadTab === 'weekly').then(rows => {
      window.__tournRows = rows;
      const me = rows && rows.find(r => r.me); window.__tournMe = me ? me.s : 0;
      if (!ui.lead.classList.contains('hidden')) renderLead(rows);
    });
  } else {
    FB.fetchTop().then(rows => { if (!ui.lead.classList.contains('hidden')) renderLead(rows); });
  }
}
$('leadBtn').addEventListener('click', () => {
  initAudio(); SFX.ui();
  ui.menu.classList.add('hidden');
  ui.lead.classList.remove('hidden');
  refreshLead();
});
for (const t of ['world', 'country', 'daily', 'weekly']) {
  $('leadTab_' + t).addEventListener('click', () => { leadTab = t; SFX.ui(); window.__tournRows = null; refreshLead(); });
}
$('leadX').addEventListener('click', showMenu);

// ---- dil seçimi ----
function renderLangs() {
  let html = '';
  for (const code in LANGS) {
    html += '<button class="settToggle ' + (save.lang === code ? 'on' : 'off') + '" style="margin:4px;min-width:40vw;" data-lang="' + code + '">' + LANGS[code].name + '</button>';
  }
  $('langList').innerHTML = html;
  $('langList').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      save.lang = b.dataset.lang;
      persist();
      SFX.ui();
      applyTexts();
      renderLangs();
      renderSettings();
    });
  });
}
$('settLang').addEventListener('click', () => { ui.langModal.classList.remove('hidden'); renderLangs(); });
$('langX').addEventListener('click', () => ui.langModal.classList.add('hidden'));

// ---- profil (isim + ülke) ----
function openNameModal() {
  $('nameInput').value = save.name || ('Pilot' + Math.floor(1000 + Math.random() * 9000));
  let fl = '';
  const cur = save.country || detectCountry();
  for (const cc of COUNTRIES) {
    fl += '<button class="flagBtn' + (cc === cur ? ' sel' : '') + '" data-cc="' + cc + '">' + flagOf(cc) + '</button>';
  }
  $('flagGrid').innerHTML = fl;
  $('flagGrid').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      $('flagGrid').querySelectorAll('button').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      SFX.ui();
    });
  });
  ui.nameModal.classList.remove('hidden');
}
$('nameSave').addEventListener('click', () => {
  const v = ($('nameInput').value || '').trim().slice(0, 12);
  save.name = v || ('Pilot' + Math.floor(1000 + Math.random() * 9000));
  const selFlag = $('flagGrid').querySelector('button.sel');
  save.country = selFlag ? selFlag.dataset.cc : detectCountry();
  persist();
  SFX.buy();
  ui.nameModal.classList.add('hidden');
});
$('settProfile').addEventListener('click', openNameModal);

// ---- öneri & hata bildirimi ----
$('settFeedback').addEventListener('click', () => {
  const txt = 'Rocket Rush v6.3 feedback (' + (save.name || 'Pilot') + '):\n\n';
  try {
    if (typeof AndroidApp !== 'undefined') AndroidApp.share(txt);
    else if (navigator.share) navigator.share({ text: txt });
    else location.href = 'mailto:?subject=Rocket%20Rush%20Feedback&body=' + encodeURIComponent(txt);
  } catch (e) {}
});

// ---- Bizi değerlendir ----
$('settRate').addEventListener('click', () => {
  SFX.ui();
  try {
    if (typeof AndroidApp !== 'undefined') AndroidApp.openMarket();
    else window.open('https://play.google.com/store/apps/details?id=com.rocketrush.game', '_blank');
  } catch (e) {}
});

// ---- Arkadaş daveti ----
$('settInvite').addEventListener('click', () => {
  SFX.ui();
  if (!FB.ok) { popup(T('offhint'), '#ffb37a'); return; }
  $('myInviteCode').textContent = save.inviteCode || '...';
  if (!save.inviteCode) FB.ensureInviteCode().then(() => { $('myInviteCode').textContent = save.inviteCode || '------'; });
  $('refErr').textContent = '';
  $('refInput').value = '';
  // davet zaten kullanılmışsa giriş kısmını gizle
  $('refInput').style.display = save.referredBy ? 'none' : '';
  $('refGo').style.display = save.referredBy ? 'none' : '';
  ui.inviteModal.classList.remove('hidden');
});
$('inviteX').addEventListener('click', () => ui.inviteModal.classList.add('hidden'));
$('inviteShare').addEventListener('click', () => {
  const txt = '🚀 Rocket Rush oyununda bana katıl! Kodumu gir, ikimiz de altın kazanalım: ' + (save.inviteCode || '') +
    '\nhttps://play.google.com/store/apps/details?id=com.rocketrush.game';
  try {
    if (typeof AndroidApp !== 'undefined') AndroidApp.share(txt);
    else if (navigator.share) navigator.share({ text: txt });
  } catch (e) {}
});
$('refGo').addEventListener('click', async () => {
  const code = ($('refInput').value || '').toUpperCase().trim();
  if (code.length !== 6) return;
  const res = await FB.redeem(code);
  if (res.ok) {
    SFX.buy(); vib(30);
    popup('🎁 +🪙' + INVITE_REWARD + ' ' + T('invited'), '#9dff70');
    ui.inviteModal.classList.add('hidden');
    showMenu();
  } else {
    $('refErr').textContent = T(res.msg === 'used' ? 'codeused' : res.msg === 'self' ? 'codeself' : 'codenf');
    SFX.near();
  }
});

// ---- mağaza önizleme ----
function showPreview(kind, idx) {
  previewOn = true;
  ui.garage.classList.add('hidden');
  ui.preview.classList.remove('hidden');
  let name = '', desc = '';
  if (kind === 'rocket') {
    const d = ROCKETS[idx];
    buildRocket(d);
    name = d.icon + ' ' + d.name; desc = d.desc;
    droneMesh.visible = false;
  } else if (kind === 'drone') {
    const d = DRONES[idx];
    droneBody.material.color.setHex(d.color);
    droneMesh.visible = true;
    name = d.icon + ' ' + d.name; desc = d.desc;
  } else {
    const t = TRAILS[idx];
    name = '🌈 ' + t.name; desc = '';
    // iz rengini kuyruk küreleriyle göster
    for (let j = 0; j < 10; j++) {
      const it = acquire(trailPool);
      if (it) {
        if (t.rainbow) MAT.trail.color.setHSL(j / 10, 1, 0.6);
        else MAT.trail.color.setHex(t.color);
        it.mesh.position.set(Math.sin(j * 0.5) * 0.8, 3.2, 3.5 + j * 0.55);
        it.mesh.scale.setScalar(1.2 - j * 0.09);
      }
    }
  }
  playerGroup.position.set(0, 3.6, 2.5);
  playerGroup.scale.setScalar(1.5);
  $('prevName').textContent = name;
  $('prevDesc').textContent = desc;
}
// ---------- ROCKET LAB ----------
function renderLab() {
  const def = getCustomDef();
  $('labStats').innerHTML = '<b>' + def.name + '</b> · ⭐ x' + def.scoreMul + ' · 🛡️ ' + def.shield + ' · 🧲 ' + def.magnet + ' · 🪙 x' + def.coinMul +
    ' &nbsp;<span style="color:#ffd54d">🪙 ' + fmt(save.coins) + '</span>';
  let html = '';
  for (const k in PARTS) {
    html += '<div class="labCat">' + PARTS[k].icon + ' ' + PARTS[k].name + '</div><div class="labRow">';
    PARTS[k].opts.forEach((o, i) => {
      const owned = save.partsOwned[k].includes(i);
      const sel = save.parts[k] === i;
      html += '<button class="labChip' + (sel ? ' sel' : owned ? ' own' : '') + '" data-k="' + k + '" data-i="' + i + '">' +
        '<b>' + o.n + '</b><span>' + (sel ? '✓' : owned ? T('select') : '🪙 ' + fmt(o.p)) + '</span></button>';
    });
    html += '</div>';
  }
  $('labRows').innerHTML = html;
  $('labRows').querySelectorAll('.labChip').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.k, i = +b.dataset.i, o = PARTS[k].opts[i];
      if (save.partsOwned[k].includes(i)) { save.parts[k] = i; SFX.ui(); }
      else if (save.coins >= o.p) {
        save.coins -= o.p;
        save.partsOwned[k].push(i);
        save.parts[k] = i;
        SFX.buy(); vib(30);
      } else { SFX.near(); return; }
      persist();
      renderLab();
      buildRocket(getCustomDef()); // önizleme anında güncellenir
    });
  });
  $('labEquip').textContent = save.selected === CUSTOM_ID ? '✓ ' + T('equipped') : '🚀 ' + T('equip');
}
$('labBtn').addEventListener('click', () => {
  SFX.ui();
  ui.garage.classList.add('hidden');
  ui.lab.classList.remove('hidden');
  previewOn = true;
  buildRocket(getCustomDef());
  droneMesh.visible = false;
  playerGroup.position.set(0, 4.6, 1.5);
  playerGroup.scale.setScalar(1.35);
  renderLab();
});
$('labX').addEventListener('click', () => {
  resetRun();
  ui.lab.classList.add('hidden');
  ui.garage.classList.remove('hidden');
  renderGarage();
});
$('labEquip').addEventListener('click', () => {
  save.selected = CUSTOM_ID;
  persist();
  SFX.buy(); vib(25);
  renderLab();
});

// ---------- KAMPANYA ekranı ----------
function renderCampaign() {
  let html = '', lastCh = 0;
  CAMPAIGN.forEach((lv, i) => {
    if (lv.ch !== lastCh) { lastCh = lv.ch; html += '<div class="labCat" style="margin-top:2vh;">🌌 ' + T('chapter') + ' ' + lv.ch + '</div>'; }
    const done = i < save.campaign;
    const locked = i > save.campaign; // sıradaki hep açık, ötesi kilitli
    html += '<div class="statLine" style="' + (done ? 'border:2px solid #4caf50;' : locked ? 'opacity:.5;' : 'border:2px solid #ffd54d;') + '">' +
      '<span>' + (done ? '✅' : locked ? '🔒' : '🎯') + ' ' + lv.t(fmt(lv.target)) + '</span>' +
      (locked ? '<b style="color:#7f8ac8">' + T('locked') + '</b>'
        : done ? '<b style="color:#9dff70">' + T('complete') + '</b>'
        : '<button class="rocketBtn" data-lv="' + i + '">▶ 🪙' + fmt(lv.reward) + '</button>') +
      '</div>';
  });
  $('campList').innerHTML = html;
  $('campList').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    campaignRun = +b.dataset.lv;
    ui.campaign.classList.add('hidden');
    beginRun(false);
  }));
  const prog = Math.round((save.campaign / CAMPAIGN.length) * 100);
  $('campProg').textContent = save.campaign + '/' + CAMPAIGN.length + '  (' + prog + '%)';
}
$('campaignBtn').addEventListener('click', () => {
  initAudio(); SFX.ui();
  ui.menu.classList.add('hidden');
  ui.campaign.classList.remove('hidden');
  renderCampaign();
});
$('campaignX').addEventListener('click', () => { SFX.ui(); showMenu(); });

$('prevX').addEventListener('click', () => {
  resetRun(); // seçili donanımı ve sahneyi geri yükler
  ui.preview.classList.add('hidden');
  ui.garage.classList.remove('hidden');
  renderGarage();
});

$('menuBtn').addEventListener('click', () => { SFX.ui(); showMenu(); });
$('garageBtn').addEventListener('click', () => {
  initAudio(); SFX.ui();
  ui.menu.classList.add('hidden');
  ui.garage.classList.remove('hidden');
  renderGarage();
});
$('garageBack').addEventListener('click', () => { SFX.ui(); showMenu(); });
$('pauseBtn').addEventListener('click', () => {
  if (state === S.PLAY) { state = S.PAUSE; ui.paused.classList.remove('hidden'); }
});
$('resumeBtn').addEventListener('click', () => {
  if (state === S.PAUSE) { state = S.PLAY; ui.paused.classList.add('hidden'); }
});
$('pauseMenuBtn').addEventListener('click', showMenu);
ui.giftBtn.addEventListener('click', () => {
  initAudio();
  const today = new Date().toDateString();
  if (save.lastGift === today) return;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  save.streak = save.lastGift === yesterday ? save.streak + 1 : 1;
  const reward = STREAK_REWARDS[Math.min(save.streak - 1, STREAK_REWARDS.length - 1)];
  save.lastGift = today;
  save.coins += reward;
  persist();
  SFX.buy(); vib(30);
  popup('🎁 Day ' + save.streak + ' Streak: +🪙' + fmt(reward) + '!', '#ffe07a');
  showMenu();
});
// ---------- Sezon Pass ekranı ----------
function renderSeason() {
  ensureSeason();
  const se = save.season;
  ui.seasonInfo.textContent = 'Season ' + (se.id + 1) + ' · ⏳ ' + seasonDaysLeft() + ' days left · 🪙 ' + fmt(save.coins);
  // mevcut kademe ve bar
  let tier = 0;
  while (tier < SP_TIERS && se.sp >= TIER_CUM[tier]) tier++;
  const prev = tier > 0 ? TIER_CUM[tier - 1] : 0;
  const pct = tier >= SP_TIERS ? 100 : Math.min(100, ((se.sp - prev) / (TIER_CUM[tier] - prev)) * 100);
  ui.seasonBar.style.width = pct + '%';
  ui.seasonSp.textContent = tier >= SP_TIERS
    ? '🎉 All ' + SP_TIERS + ' tiers complete! ' + fmt(se.sp) + ' SP'
    : 'Tier ' + tier + '/' + SP_TIERS + ' · ' + fmt(se.sp) + ' / ' + fmt(TIER_CUM[tier]) + ' SP';
  ui.premiumBtn.classList.toggle('hidden', se.premium);
  ui.premiumBtn.classList.toggle('locked2', save.coins < PASS_PREMIUM_COST);
  // kademe listesi
  ui.tierList.innerHTML = '';
  for (let i = 0; i < SP_TIERS; i++) {
    const rw = tierRewards(i);
    const unlocked = se.sp >= TIER_CUM[i];
    const row = document.createElement('div');
    row.className = 'tierRow' + (unlocked ? ' unlocked' : '');
    const fState = se.cf.includes(i) ? 'claimed' : unlocked ? 'claimable' : 'locked';
    const pState = se.cp.includes(i) ? 'claimed' : (unlocked && se.premium) ? 'claimable' : 'locked';
    row.innerHTML =
      '<div class="tierNum">' + (i + 1) + '</div>' +
      '<button class="tierCell ' + fState + '" data-k="f" data-i="' + i + '">' + (fState === 'claimed' ? '✓ ' : '') + rewardLabel(rw.f) + '</button>' +
      '<button class="tierCell prem ' + pState + '" data-k="p" data-i="' + i + '">' + (pState === 'claimed' ? '✓ ' : (se.premium ? '' : '👑 ')) + rewardLabel(rw.p) + '</button>';
    ui.tierList.appendChild(row);
  }
  ui.tierList.querySelectorAll('.tierCell.claimable').forEach(b => {
    b.addEventListener('click', () => {
      const i = +b.dataset.i, k = b.dataset.k;
      const se2 = save.season;
      if (se2.sp < TIER_CUM[i]) return;
      const list = k === 'f' ? se2.cf : se2.cp;
      if (list.includes(i)) return;
      if (k === 'p' && !se2.premium) return;
      list.push(i);
      grantReward(k === 'f' ? tierRewards(i).f : tierRewards(i).p);
      persist();
      SFX.buy(); vib(25);
      renderSeason();
    });
  });
}
$('seasonBtn').addEventListener('click', () => {
  initAudio(); SFX.ui();
  ui.menu.classList.add('hidden');
  ui.season.classList.remove('hidden');
  renderSeason();
});
$('seasonBack').addEventListener('click', () => { SFX.ui(); showMenu(); });
ui.premiumBtn.addEventListener('click', () => {
  ensureSeason();
  if (save.season.premium || save.coins < PASS_PREMIUM_COST) return;
  save.coins -= PASS_PREMIUM_COST;
  save.season.premium = true;
  persist();
  SFX.buy(); vib(40);
  popup('👑 PREMIUM PASS UNLOCKED!', '#ffd54d');
  renderSeason();
});

// ---------- Ayarlar ekranı ----------
function setToggle(btn, on) {
  btn.textContent = on ? 'ON' : 'OFF';
  btn.classList.toggle('on', on);
  btn.classList.toggle('off', !on);
}
let resetArmed = false;
function renderSettings() {
  setToggle(ui.settSound, !save.muted);
  setToggle(ui.settMusic, !save.musicOff);
  setToggle(ui.settVib, !save.vibOff);
  ui.settTutorial.textContent = save.tutorialDone ? 'REPLAY' : 'QUEUED ✓';
  $('curLang').textContent = LANGS[save.lang] ? LANGS[save.lang].name : 'ENGLISH';
  $('curProfile').innerHTML = flagOf(save.country) + ' ' + nameHTML(save.name || '—');
  resetArmed = false;
  ui.settReset.textContent = 'RESET';
}
$('settingsBtn').addEventListener('click', () => {
  initAudio(); SFX.ui();
  ui.menu.classList.add('hidden');
  ui.settings.classList.remove('hidden');
  renderSettings();
});
$('settingsBack').addEventListener('click', () => { SFX.ui(); showMenu(); });
ui.settSound.addEventListener('click', () => {
  save.muted = !save.muted;
  persist();
  if (!save.muted) { initAudio(); SFX.ui(); }
  renderSettings();
});
ui.settMusic.addEventListener('click', () => {
  save.musicOff = !save.musicOff;
  persist();
  if (!save.musicOff) initAudio();
  SFX.ui();
  renderSettings();
});
ui.settVib.addEventListener('click', () => {
  save.vibOff = !save.vibOff;
  persist();
  vib(40); SFX.ui();
  renderSettings();
});
ui.settTutorial.addEventListener('click', () => {
  save.tutorialDone = false;
  persist();
  SFX.ui();
  renderSettings();
});
// yanlışlıkla silmeye karşı iki aşamalı onay
ui.settReset.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    ui.settReset.textContent = 'SURE?';
    SFX.near();
    setTimeout(() => { resetArmed = false; ui.settReset.textContent = 'RESET'; }, 3000);
    return;
  }
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  location.reload();
});
ui.shareBtn.addEventListener('click', () => {
  const text = 'I scored ' + fmt(save.best) + ' in Rocket Rush! 🚀 Can you beat me?';
  try {
    if (typeof AndroidApp !== 'undefined') AndroidApp.share(text);
    else if (navigator.share) navigator.share({ text });
  } catch (e) {}
});
$('reviveYes').addEventListener('click', () => { if (save.coins >= REVIVE_COST) doRevive(false); });
$('reviveNo').addEventListener('click', gameOver);

// Ödüllü reklam akışı: buton → reklam → ödül gelirse bedava canlan,
// reklam kapanır ödül gelmezse (atlandıysa) oyun biter
let adRewardGranted = false;
ui.reviveAd.addEventListener('click', () => {
  if (state !== S.REVIVE) return;
  adRewardGranted = false;
  reviveT = 999; // reklam açıkken geri sayım oyuncuyu öldürmesin
  Ads.showRewarded();
});
window.onAdReward = () => { adRewardGranted = true; };
window.onAdClosed = () => {
  if (state !== S.REVIVE) return;
  if (adRewardGranted) doRevive(true);
  else gameOver();
  adRewardGranted = false;
};
window.onAdFailed = () => { if (state === S.REVIVE) gameOver(); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === S.PLAY) { state = S.PAUSE; ui.paused.classList.remove('hidden'); }
});

// ---------- Çarpışma ----------
function hitsPlayer(item, radius) {
  const p = playerGroup.position, m = item.mesh.position;
  if (Math.abs(m.z - p.z) > radius) return false;
  if (Math.abs(m.x - p.x) > 1.5) return false;
  if (Math.abs(m.y - p.y) > 1.7) return false;
  return true;
}
function nearMissCheck(it, prevZ) {
  // engel bu karede oyuncu düzlemini geçtiyse ve çarpmadıysa
  if (it.counted || prevZ > 0) return;
  if (it.mesh.position.z <= 0) return;
  it.counted = true;
  const p = playerGroup.position, m = it.mesh.position;
  const y = it.beamY !== undefined ? it.beamY : m.y;
  if (Math.abs(m.x - p.x) < 3.4 && Math.abs(y - p.y) < 3.2) {
    runStats.near++;
    combo++; comboT = 4;
    if (combo > runStats.maxCombo) runStats.maxCombo = combo;
    const bonus = Math.floor(40 * combo * rocketDef.scoreMul * (fx.mult > 0 ? 2 : 1));
    score += bonus;
    popup(combo > 1 ? 'COMBO x' + combo + '! +' + bonus : T('nearmiss') + ' +' + bonus, combo > 2 ? '#ffb84d' : '#9fd4ff');
    camShake = Math.max(camShake, 0.22);
    SFX.near(); vib(15);
  }
}
function onHit(item) {
  release(item);
  // FOUNDER god mode (yalnız TEST panelinden açılır): ölümsüzlük
  if (window.__god) { sparkBurst(playerGroup.position, 6); SFX.near(); vib(10); return; }
  combo = 0; comboT = 0;
  if (fx.shield > 0 || fx.turbo > 0) {
    sparkBurst(playerGroup.position, 6);
    SFX.near(); vib(20);
    return;
  }
  if (shieldLeft > 0) {
    shieldLeft--;
    shieldMesh.visible = false;
    sparkBurst(playerGroup.position, 8);
    scene.fog.color.setHex(0x224466);
    SFX.near(); vib(40);
    popup(T('armorbrk'), '#ff9a7a');
    return;
  }
  startDeath();
}

// ---------- Ana döngü ----------
let lastT = performance.now();
let hudTick = 0, trailTick = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  // ölümün ilk yarım saniyesi ağır çekim (sinematik patlama)
  if (state === S.DYING && deathT < 0.55) dt *= 0.35;

  if (player) {
    flame.scale.y = (fx.turbo > 0 ? 1.5 : 1) * (0.85 + Math.sin(now * 0.02) * 0.25);
    player.rotation.z = Math.sin(now * 0.003) * 0.06;
  }
  // dron yörüngesi (menüde de döner)
  if (droneMesh.visible) {
    const da = now * 0.0028;
    droneMesh.position.set(
      playerGroup.position.x + Math.cos(da) * 1.7,
      playerGroup.position.y + 0.7 + Math.sin(da * 2) * 0.35,
      playerGroup.position.z + Math.sin(da) * 1.7
    );
    droneRing.rotation.z += dt * 4;
  }
  if (previewOn) playerGroup.rotation.y += dt * 1.3;
  // kıvılcımlar her durumda güncellenir
  for (const s of sparks) {
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { s.mesh.visible = false; continue; }
    s.vy -= 18 * dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    s.mesh.scale.setScalar(Math.max(0.05, s.life * 2.5));
  }
  for (const sh of shocks) {
    if (sh.life <= 0) continue;
    sh.life -= dt;
    if (sh.life <= 0) { sh.mesh.visible = false; continue; }
    sh.mesh.scale.setScalar(0.4 + (0.45 - sh.life) * 9);
  }

  if (state === S.DYING) {
    deathT += dt;
    for (const d of debris) {
      if (!d.mesh.visible) continue;
      d.vy -= 28 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += dt * 6;
      d.mesh.rotation.y += dt * 5;
      const sc = Math.max(0.01, d.mesh.scale.x * (1 - dt * 1.1));
      d.mesh.scale.setScalar(sc);
      if (d.mesh.position.y < 0.1) { d.mesh.position.y = 0.1; d.vy *= -0.35; d.vx *= 0.8; d.vz *= 0.8; }
    }
    camShake = Math.max(0, camShake - dt * 1.6);
    camera.position.set((Math.random() - 0.5) * camShake, CAM_Y + (Math.random() - 0.5) * camShake, CAM_Z);
    if (deathT > 1.5) {
      camera.position.set(0, CAM_Y, CAM_Z);
      camera.lookAt(0, 1.0, -40);
      if (!revived && !battleOn && (save.coins >= REVIVE_COST || Ads.rewardedReady())) offerRevive();
      else gameOver();
    }
  }

  if (state === S.REVIVE) {
    reviveT -= dt;
    ui.reviveBar.style.width = Math.max(0, (reviveT / 5) * 100) + '%';
    if (reviveT <= 0) gameOver();
  }

  if (state === S.PLAY) {
    elapsed += dt;
    // onboarding: ilk 2 koşu daha yavaş ve nazik başlar (yeni oyuncu tutunsun)
    const easy = save.playCount <= 2 && !battleOn && campaignRun < 0;
    speed = battleOn ? Math.min(95, 30 + elapsed * 1.1)
      : easy ? Math.min(64, 22 + elapsed * 0.42)
      : Math.min(74, 26 + elapsed * 0.55);
    const eff = fx.turbo > 0 ? speed * 1.6 : speed;
    const dz = eff * dt;
    runStats.dist += dz;

    for (const k of PU_KEYS) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
    score += dz * rocketDef.scoreMul * (1 + (droneDef && droneDef.scoreBonus ? droneDef.scoreBonus : 0)) * (fx.mult > 0 ? 2 : 1) * (fx.turbo > 0 ? 1.5 : 1);
    if (coinStreakT > 0) { coinStreakT -= dt; if (coinStreakT <= 0) coinStreak = 0; }

    // kombo süresi
    if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

    // battle: rakipler elenir, son kalan kazanır
    if (battleOn) {
      let alive = 0;
      for (const b of bots) {
        if (!b.alive) continue;
        if (b.real) {
          // gerçek oyuncu: canlılığı Firestore senkronu tazeler (mpSync)
          if (b.done) { b.alive = false; popup('💀 ' + b.name + ' ' + T('eliminated'), '#ff9a7a'); SFX.near(); }
          else alive++;
        } else {
          if (elapsed > b.deathAt) { b.alive = false; popup('💀 ' + b.name + ' ' + T('eliminated'), '#ff9a7a'); SFX.near(); }
          else alive++;
        }
      }
      if (alive === 0 && !battleWon) {
        battleWon = true;
        popup('🏆 ' + T('winner'), '#ffd54d');
        SFX.mission(); vib([80, 60, 200]);
        gameOver();
        return renderer.render(scene, camera);
      }
    }

    // kilometre taşları: her 500 m'de kutlama + altın
    if (runStats.dist >= nextMile) {
      const mileBonus = 25 + Math.floor(nextMile / 100);
      runCoins += mileBonus;
      runStats.coins += mileBonus;
      popup('🏁 ' + fmt(nextMile) + ' m! +🪙' + mileBonus, '#9dff70');
      sparkBurst(playerGroup.position, 8);
      SFX.mission(); vib(20);
      nextMile += 500;
    }

    // ---- KAMPANYA hedefi tamamlandı mı? ----
    if (campaignRun >= 0 && !campaignWon) {
      const lv = CAMPAIGN[campaignRun];
      const val = lv.stat === 'combo' ? runStats.maxCombo : lv.stat === 'boss' ? runStats.boss : runStats[lv.stat];
      if (val >= lv.target) {
        campaignWon = true;
        if (campaignRun >= save.campaign) { save.campaign = campaignRun + 1; save.coins += lv.reward; }
        persist();
        popup('✅ ' + T('leveldone') + ' +🪙' + fmt(lv.reward), '#9dff70');
        sparkBurst(playerGroup.position, 12);
        SFX.mission(); vib([60, 40, 120]);
        setTimeout(gameOver, 1200); // kısa kutlama sonrası bitir
      }
    }

    // ---- UFO BOSS ----
    if (!bossActive && !eventActive && !battleOn && runStats.dist >= bossNext) {
      bossActive = true;
      bossLevel++;
      bossType = (bossLevel - 1) % 3; // 0 Laser Grid · 1 Barrage · 2 Sweep
      bossT = 12;
      bossAtkT = 1.4;
      boss.visible = true;
      boss.position.set(0, 7, -70);
      bossIntro = 0.8;
      boss.scale.setScalar(0.05);
      const bossName = ['🛸 Laser Grid', '☄️ Barrage', '🌀 Sweep'][bossType];
      boss.children[2].material.color.setHex([0x66ff88, 0xff5544, 0xaa66ff][bossType]); // kubbe rengi türe göre
      popup('👽 ' + T('boss_in') + ' · ' + bossName, '#ff6666');
      tone(180, 120, 0.4, 'sawtooth', 0.3);
      setTimeout(() => tone(180, 120, 0.4, 'sawtooth', 0.3), 450);
      vib([80, 60, 80]);
    }
    if (bossActive) {
      bossT -= dt;
      if (bossIntro > 0) {
        bossIntro = Math.max(0, bossIntro - dt);
        const k = 1 - bossIntro / 0.8;
        const e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // easeOutBack
        boss.scale.setScalar(Math.max(0.05, e));
      }
      boss.position.x = Math.sin(now * 0.001) * 3.2;
      boss.position.y = 6.5 + Math.sin(now * 0.002) * 0.6;
      boss.rotation.y += dt * 1.5;
      bossAtkT -= dt;
      if (bossAtkT <= 0) {
        // türe göre farklı saldırı deseni — hepsi hedef-işaret → lazer mekaniğini kullanır
        let lanes2 = [];
        if (bossType === 0) {
          // Laser Grid: 1-2 rastgele şerit
          bossAtkT = Math.max(1.1, 2.0 - bossLevel * 0.12);
          const n = Math.random() < Math.min(0.7, 0.3 + bossLevel * 0.1) ? 2 : 1;
          const ls = [0, 1, 2];
          for (let i = 0; i < n; i++) lanes2.push(ls.splice(Math.floor(Math.random() * ls.length), 1)[0]);
        } else if (bossType === 1) {
          // Barrage: tek şerit ama çok hızlı ardarda
          bossAtkT = Math.max(0.55, 0.9 - bossLevel * 0.03);
          lanes2.push(Math.floor(Math.random() * 3));
        } else {
          // Sweep: 2 bitişik şeride vurur, tek boş şerit bırakır (oraya kaçarsın)
          bossAtkT = Math.max(1.3, 2.2 - bossLevel * 0.1);
          const safe = Math.floor(Math.random() * 3);
          for (let li = 0; li < 3; li++) if (li !== safe) lanes2.push(li);
        }
        for (const li of lanes2) {
          const w = acquire(warnPool);
          if (w) { w.mesh.position.set(LANES[li], 0.35, -46); w.t = bossType === 1 ? 0.7 : 0.9; w.mesh.scale.setScalar(1); }
        }
        tone(600, 300, 0.15, 'square', 0.12);
      }
      if (bossT <= 0) {
        // boss pes etti: ödül + kaç
        bossActive = false;
        boss.visible = false;
        const reward = 300 + bossLevel * 200;
        runCoins += reward;
        runStats.coins += reward;
        runStats.boss++;
        bossNext += 1800;
        popup('💥 ' + T('boss_out') + ' +🪙' + fmt(reward), '#9dff70');
        sparkBurst(playerGroup.position, 10);
        SFX.mission(); vib([60, 40, 120]);
      }
    }
    // hedef işaretleri: süre dolunca yerinde lazer kolonu biter
    for (const it of warnPool) {
      if (!it.active) continue;
      it.mesh.position.z += dz;
      it.t -= dt;
      it.mesh.scale.setScalar(1 + (0.9 - it.t) * 0.5);
      if (it.t <= 0) {
        const b = acquire(bossBeamPool);
        if (b) { b.mesh.position.set(it.mesh.position.x, 4.5, it.mesh.position.z); b.life = 1.1; }
        tone(900, 80, 0.3, 'sawtooth', 0.2);
        release(it);
        continue;
      }
      if (it.mesh.position.z > KILL_Z) release(it);
    }
    for (const it of bossBeamPool) {
      if (!it.active) continue;
      it.mesh.position.z += dz;
      it.life -= dt;
      if (it.life <= 0 || it.mesh.position.z > KILL_Z) { release(it); continue; }
      const p = playerGroup.position, m = it.mesh.position;
      if (Math.abs(m.z - p.z) < 0.8 && Math.abs(m.x - p.x) < 1.3) { onHit(it); continue; } // kolon: her yükseklikte vurur
    }

    // etkinlik zamanlayıcısı: meteor yağmuru / coin rush dönüşümlü
    if (!eventActive && !bossActive) {
      eventT -= dt;
      if (eventT <= 0) {
        eventActive = eventAlt++ % 2 === 0 ? 'meteor' : 'coinrush';
        eventDur = eventActive === 'meteor' ? 8 : 6;
        popup(eventActive === 'meteor' ? '⚠️ ' + T('meteor') : '💰 ' + T('coinrush'), eventActive === 'meteor' ? '#ff9a7a' : '#ffd54d');
        SFX.mission(); vib(30);
      }
    } else if (eventActive) {
      eventDur -= dt;
      if (eventDur <= 0) { eventActive = null; eventT = 35 + Math.random() * 20; }
    }

    // tema geçişi
    const ti = Math.floor(runStats.dist / THEME_LEN) % THEMES.length;
    if (ti !== themeIdx) {
      snapTheme(ti);
      popup(THEMES[ti].name, '#cfd8ff');
    }
    applyThemeLerp(Math.min(1, dt * 1.2));

    // hız hissi: turbo/hızda FOV hafif açılır
    const targetFov = BASE_FOV + (eff - 26) * 0.18 + (fx.turbo > 0 ? 5 : 0);
    if (Math.abs(targetFov - curFov) > 0.2) {
      curFov += (targetFov - curFov) * Math.min(1, dt * 3);
      camera.fov = curFov;
      camera.updateProjectionMatrix();
    }

    const tx = LANES[targetLane];
    playerGroup.position.x += (tx - playerGroup.position.x) * Math.min(1, dt * 12);
    playerGroup.position.y += (flyTarget - playerGroup.position.y) * Math.min(1, dt * 8);
    rollKick *= Math.max(0, 1 - dt * 5);
    playerGroup.rotation.z = (playerGroup.position.x - tx) * 0.12 + rollKick;
    playerGroup.rotation.x = Math.max(-0.3, Math.min(0.3, (flyTarget - playerGroup.position.y) * 0.14));

    camera.position.x += (playerGroup.position.x * 0.35 - camera.position.x) * Math.min(1, dt * 6);
    // yakın geçiş/kalkan sarsıntısı (küçük ve kısa)
    if (camShake > 0) {
      camera.position.x += (Math.random() - 0.5) * camShake;
      camera.position.y = CAM_Y + (Math.random() - 0.5) * camShake * 0.5;
      camShake = Math.max(0, camShake - dt * 2.5);
      if (camShake === 0) camera.position.y = CAM_Y;
    }
    camera.lookAt(camera.position.x * 0.5, 1.0, -40);

    shieldMesh.visible = shieldLeft > 0 || fx.shield > 0 || fx.turbo > 0;

    // egzoz izi
    trailTick += dt;
    if (trailTick > 0.045) {
      trailTick = 0;
      const t = acquire(trailPool);
      if (t) {
        // seçili iz rengi (Rainbow sürekli renk değiştirir)
        const tr = TRAILS[save.trail] || TRAILS[0];
        if (tr.rainbow) MAT.trail.color.setHSL((now * 0.0004) % 1, 1, 0.6);
        else MAT.trail.color.setHex(tr.color);
        t.mesh.position.set(playerGroup.position.x, playerGroup.position.y, playerGroup.position.z + 1.9);
        t.mesh.scale.setScalar(fx.turbo > 0 ? 1.5 : 1);
      }
    }
    for (const it of trailPool) {
      if (!it.active) continue;
      it.mesh.position.z += dz * 0.9;
      const sc = it.mesh.scale.x * (1 - dt * 4);
      if (sc < 0.06 || it.mesh.position.z > KILL_Z) { release(it); continue; }
      it.mesh.scale.setScalar(sc);
    }

    for (const t of groundTiles) {
      t.position.z += dz;
      if (t.position.z > 40) t.position.z -= 9 * 40;
    }

    distSinceSpawn += dz;
    if (eventActive === 'coinrush') {
      // coin rush: engel yok, yol altın dolu
      if (distSinceSpawn >= 10) { distSinceSpawn = 0; spawnCoinRow(SPAWN_Z); }
    } else if (bossActive) {
      // boss sırasında normal engel gelmez, arada altın sırası gelir
      if (distSinceSpawn >= 20) { distSinceSpawn = 0; spawnCoinRow(SPAWN_Z); }
    } else {
      const gap = Math.max(26, 46 - elapsed * 0.4);
      if (distSinceSpawn >= gap) { distSinceSpawn = 0; spawnWave(); }
    }
    distSinceScenery += dz;
    if (distSinceScenery >= 16) { distSinceScenery = 0; spawnScenery(SPAWN_Z); }

    // meteor yağmuru: gökten çapraz düşen ateş topları
    if (eventActive === 'meteor') {
      meteorTick += dt;
      if (meteorTick > 0.55) {
        meteorTick = 0;
        const m = acquire(meteorPool);
        if (m) {
          m.mesh.position.set(LANES[Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * 1.2, 22, -140 - Math.random() * 60);
          m.vy = -(9 + Math.random() * 5);
        }
      }
    }
    for (const it of meteorPool) {
      if (!it.active) continue;
      it.mesh.position.z += dz * 1.25;
      it.mesh.position.y += it.vy * dt;
      it.mesh.rotation.x += dt * 5;
      if (it.mesh.position.y < 0.4) { sparkBurst(it.mesh.position, 4); release(it); continue; }
      if (it.mesh.position.z > KILL_Z) { release(it); continue; }
      if (hitsPlayer(it, 1.3)) { onHit(it); continue; }
    }

    // hız çizgileri
    if (eff > 42 || fx.turbo > 0) {
      lineTick += dt;
      if (lineTick > 0.09) {
        lineTick = 0;
        const l = acquire(speedLinePool);
        if (l) l.mesh.position.set((Math.random() < 0.5 ? -1 : 1) * (6.5 + Math.random() * 4.5), 1.5 + Math.random() * 6, -60);
      }
    }
    for (const it of speedLinePool) {
      if (!it.active) continue;
      it.mesh.position.z += dz * 1.7;
      if (it.mesh.position.z > KILL_Z) release(it);
    }

    // --- kayalar ---
    for (const it of rockPool) {
      if (!it.active) continue;
      const prevZ = it.mesh.position.z;
      it.mesh.position.z += dz;
      it.mesh.rotation.y += dt * 1.5;
      if (it.moving) it.mesh.position.x = it.baseX + Math.sin(now * 0.0016 + it.phase) * 3.2;
      if (it.mesh.position.z > KILL_Z) { release(it); continue; }
      if (hitsPlayer(it, 1.4)) { onHit(it); continue; }
      nearMissCheck(it, prevZ);
    }
    // --- bariyerler ---
    MAT.beam.opacity = 0.55 + 0.35 * Math.sin(now * 0.012); // lazerler nefes alır
    for (const it of barrierPool) {
      if (!it.active) continue;
      const prevZ = it.mesh.position.z;
      it.mesh.position.z += dz;
      it.mesh.children[1].position.y = 1.2 + Math.sin(now * 0.006 + it.mesh.position.x) * 0.16;
      it.mesh.rotation.y = Math.sin(now * 0.003 + it.mesh.position.x) * 0.07;
      if (it.mesh.position.z > KILL_Z) { release(it); continue; }
      if (hitsPlayer(it, 1.0)) { onHit(it); continue; }
      nearMissCheck(it, prevZ);
    }
    // --- lazer kapıları ---
    for (const it of laserPool) {
      if (!it.active) continue;
      const prevZ = it.mesh.position.z;
      it.mesh.position.z += dz;
      const beam = it.mesh.children[2];
      beam.visible = Math.sin(now * 0.004 + it.phase) > -0.25; // ~%60 açık
      if (it.mesh.position.z > KILL_Z) { release(it); continue; }
      if (beam.visible) {
        const p = playerGroup.position, m = it.mesh.position;
        if (Math.abs(m.z - p.z) < 0.9 && Math.abs(m.x - p.x) < 1.5 && Math.abs(it.beamY - p.y) < 1.3) { onHit(it); continue; }
      }
      nearMissCheck(it, prevZ);
    }
    // --- kenar dekorları ---
    for (const it of sceneryPool) {
      if (!it.active) continue;
      it.mesh.position.z += dz;
      if (it.mesh.isPlanet) it.mesh.rotation.y += dt * 0.4;
      if (it.mesh.position.z > KILL_Z + 10) release(it);
    }
    // --- güçlendirmeler ---
    for (const it of powerupPool) {
      if (!it.active) continue;
      it.mesh.position.z += dz;
      it.mesh.rotation.y += dt * 2.5;
      it.mesh.children[1].rotation.x += dt * 3;
      it.mesh.scale.setScalar(1 + 0.1 * Math.sin(now * 0.008)); // nabız gibi atar
      if (it.mesh.position.z > KILL_Z) { release(it); continue; }
      if (hitsPlayer(it, 1.4)) {
        fx[it.pu] = puDuration(it.pu);
        runStats.pu++;
        popup(POWERUPS[it.pu].icon + ' ' + POWERUPS[it.pu].name + '!', '#9dff70');
        shockwave(playerGroup.position, POWERUPS[it.pu].color);
        SFX.pu(); vib(25);
        release(it);
      }
    }
    // --- altınlar ---
    const magR = Math.max(rocketDef.magnet, (fx.magnet > 0 || fx.turbo > 0) ? 8 : 0);
    for (const it of coinPool) {
      if (!it.active) continue;
      it.mesh.position.z += dz;
      it.mesh.rotation.z += dt * 4;
      if (it.mesh.position.z > KILL_Z) { release(it); continue; }
      let caught = false;
      if (magR > 0) {
        const p = playerGroup.position, m = it.mesh.position;
        const ddx = p.x - m.x, ddy = p.y - m.y, ddz = p.z - m.z;
        const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
        if (d2 < magR * magR) {
          // çekim dünya kayışından güçlü olmalı, yoksa altın roketin
          // arkasında dengeye gelip sonsuza dek kuyruk yapar
          const pull = Math.min(1, dt * 40);
          m.x += ddx * pull; m.y += ddy * pull; m.z += ddz * pull;
          caught = d2 < 4; // mıknatısın ağzına gelen direkt toplanır
        }
      }
      if (caught || hitsPlayer(it, 1.2)) {
        const gain = rocketDef.coinMul * (dayFirstRun ? 2 : 1) * (itemDouble ? 2 : 1);
        runCoins += gain;
        runStats.coins += gain;
        sparkBurst(it.mesh.position, 3);
        // seri toplayışta ses tizleşir (dopamin merdiveni)
        coinStreak++; coinStreakT = 0.9;
        SFX.coin(coinStreak);
        release(it);
      }
    }

    hudTick += dt;
    if (hudTick > 0.1) {
      hudTick = 0;
      ui.hudScore.textContent = fmt(score);
      if (ui.hudCoins.dataset.v !== String(runCoins)) {
        ui.hudCoins.dataset.v = String(runCoins);
        ui.hudCoins.textContent = '🪙 ' + fmt(runCoins);
        ui.hudCoins.classList.remove('bump');
        void ui.hudCoins.offsetWidth;
        ui.hudCoins.classList.add('bump');
      }
      let chips = '';
      if (battleOn) chips += '<div class="fxChip" style="border-color:#ffd54d;color:#ffe07a;">👥 ' + (bots.filter(b => b.alive).length + 1) + '/' + (bots.length + 1) + '</div>';
      if (bossActive) chips += '<div class="fxChip" style="border-color:#ff5566;color:#ff9aa5;">👽 ' + Math.ceil(bossT) + '</div>';
      if (combo > 1) chips += '<div class="fxChip">🎯 x' + combo + '</div>';
      for (const k of PU_KEYS) if (fx[k] > 0) chips += '<div class="fxChip">' + POWERUPS[k].icon + ' ' + Math.ceil(fx[k]) + '</div>';
      ui.fxBar.innerHTML = chips;
    }
  }

  renderer.render(scene, camera);
}

// ---------- Başlat ----------
for (let i = 0; i < 28; i++) {
  const st = document.createElement('div');
  st.className = 'menuStar';
  const sz = 1 + Math.random() * 2.5;
  st.style.width = st.style.height = sz + 'px';
  st.style.left = Math.random() * 100 + '%';
  st.style.top = Math.random() * 100 + '%';
  st.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
  ui.menu.appendChild(st);
}

// paylaşım desteklenmiyorsa butonu gizle; TEST modu rozetini göster
ui.shareBtn.classList.toggle('hidden', typeof AndroidApp === 'undefined' && !navigator.share);
ui.cheatBadge.classList.toggle('hidden', !CHEAT);

buildRocket(getRocketDef());
applyTexts();
showMenu();
requestAnimationFrame(loop);

// BOSNA GAMES açılış ekranını ~2.6 sn sonra kapat, sonra ilk kurulum modallarını aç
setTimeout(() => {
  const sp = document.getElementById('splash');
  if (sp) sp.classList.add('gone');
  setTimeout(() => { if (sp) sp.style.display = 'none'; if (!save.name) openNameModal(); }, 650);
}, 2600);


// ==================== v6.2 HELP & STAFF (rol tabanlı) ====================
(function () {
  const st = document.createElement('style');
  st.textContent =
    '#helpBtn{position:fixed;right:12px;top:50%;transform:translateY(-50%);z-index:66;width:46px;height:46px;border-radius:50%;' +
    'background:linear-gradient(135deg,#2f6fe0,#1a3a8f);color:#fff;border:2px solid #9ec2ff;font:800 22px/1 "Segoe UI";cursor:pointer;' +
    'box-shadow:0 3px 12px rgba(0,0,0,.5);display:none}' +
    '#staffBtn{position:fixed;left:10px;top:52px;z-index:66;padding:7px 11px;border-radius:12px;border:2px solid #ffd23a;color:#fff;' +
    'font:700 13px/1 "Segoe UI";cursor:pointer;background:linear-gradient(135deg,#e11d38,#8f0d20);box-shadow:0 3px 12px rgba(0,0,0,.5);display:none}' +
    '.mM{position:fixed;inset:0;z-index:230;display:none;align-items:center;justify-content:center;background:rgba(3,1,10,.9)}' +
    '.mM.on{display:flex}' +
    '.mC{width:min(94vw,470px);max-height:88vh;overflow-y:auto;background:#120a22;border:2px solid #3a2a5a;border-radius:18px;padding:16px;color:#fff}' +
    '.mC h2{text-align:center;font:800 18px/1.2 "Segoe UI";margin-bottom:10px}' +
    '.mBtn{width:100%;text-align:left;margin:6px 0;padding:12px 13px;border:none;border-radius:11px;cursor:pointer;font:700 14px "Segoe UI";color:#fff;background:#241a3a}' +
    '.mBtn:active{transform:scale(.98)}' +
    '.mTa{width:100%;min-height:90px;border-radius:10px;border:1px solid #3a2a5a;background:#0c0718;color:#fff;padding:10px;font:400 14px "Segoe UI";resize:vertical}' +
    '.mClose{width:100%;margin-top:12px;padding:11px;border:2px solid #445;border-radius:11px;background:transparent;color:#ccd;font:700 14px "Segoe UI";cursor:pointer}' +
    '.chatMsg{max-width:82%;margin:5px 0;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.4;word-wrap:break-word}' +
    '.chatMsg.me{background:#2f6fe0;margin-left:auto;border-bottom-right-radius:3px}' +
    '.chatMsg.them{background:#8f0d20;border-bottom-left-radius:3px}' +
    '.chatMsg.bot{background:#333;border-bottom-left-radius:3px;font-style:italic}' +
    '.fbadge.b-admin{background:#1a5fd0}.fname.b-admin{color:#6fb0ff}';
  document.head.appendChild(st);

  const elc = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtT = t => { try { return new Date(t).toLocaleString(); } catch (e) { return ''; } };
  function makeModal() {
    const w = elc('div'); w.className = 'mM';
    const card = elc('div'); card.className = 'mC';
    const h = elc('h2'); const body = elc('div', 'font-size:13px');
    const close = elc('button', null, 'KAPAT'); close.className = 'mClose';
    close.onclick = () => w.classList.remove('on');
    w.onclick = e => { if (e.target === w) w.classList.remove('on'); };
    card.appendChild(h); card.appendChild(body); card.appendChild(close);
    w.appendChild(card); document.body.appendChild(w);
    return { w: w, h: h, body: body, open: () => w.classList.add('on'), hide: () => w.classList.remove('on') };
  }
  const mBtn = (txt, bg, fn) => { const b = elc('button', bg ? 'background:' + bg : null, txt); b.className = 'mBtn'; b.onclick = fn; return b; };

  // ===== HELP butonu (herkese açık) =====
  const helpBtn = elc('button', null, '?'); helpBtn.id = 'helpBtn';
  document.body.appendChild(helpBtn);
  const hM = makeModal();
  helpBtn.onclick = () => { SFX.ui && SFX.ui(); helpMenu(); hM.open(); };

  function helpMenu() {
    hM.h.textContent = '❓ YARDIM';
    hM.body.innerHTML = '';
    hM.body.appendChild(mBtn('🎮 Nasıl oynanır?', '#2f6fe0', howTo));
    hM.body.appendChild(mBtn('🐞 Hata bildir', '#c2461f', bugReport));
    hM.body.appendChild(mBtn('💬 Öneri / Destek', '#2ea86a', support));
    if (FB.ok && FB.role === 'user') hM.body.appendChild(mBtn('🛡 Admin olmak için başvur', '#5a4a7a', applyAdminForm));
    hM.body.appendChild(mBtn('📋 UID\'imi göster (geçici)', '#444', showMyUid));
  }
  function showMyUid() {
    const id = FB.uid || '(giriş yok — internete bağlan)';
    try { navigator.clipboard && navigator.clipboard.writeText(id); } catch (e) {}
    hM.h.textContent = '📋 UID';
    hM.body.innerHTML = '<div style="background:#0c0718;border-radius:10px;padding:12px;word-break:break-all;font-size:12px"><b>UID:</b><br>' + esc(id) + '<br><br><b>Rol:</b> ' + esc(FB.role) + '<br><span style="color:#889">(panoya kopyalandı — kurucuya ver)</span></div>';
    hM.body.appendChild(mBtn('← Geri', '#333', helpMenu));
  }
  function howTo() {
    hM.h.textContent = '🎮 NASIL OYNANIR';
    hM.body.innerHTML =
      '<div style="line-height:1.7;font-size:13.5px">' +
      '🚀 <b>Amaç:</b> roketini olabildiğince uzağa uçur, hiçbir şeye çarpma!<br><br>' +
      '👉 <b>Kontrol:</b> Parmağını kaldırmadan <b>sürükle</b> — sağa/sola şerit değiştir, yukarı/aşağı yüksel-alçal (Subway Surfers gibi).<br><br>' +
      '☄️ Asteroit, lazer kapıları ve sütunlardan sıyrıl.<br>' +
      '🪙 Altın topla, GARAJ\'dan roket ve yükseltme al.<br>' +
      '🧲 Güçlendirmeler: Mıknatıs, Kalkan, 2x Puan, Turbo.<br>' +
      '🛸 Belirli mesafede UFO boss gelir — hareketlerinden kaç.<br>' +
      '🏆 Skor tablosu, turnuvalar, çok oyunculu odalar.<br>' +
      '🛠️ ROKET LAB: kendi roketini parça parça yap.<br><br>' +
      '💡 Günlük seri ödülünü kaçırma, şans kutusunu aç!</div>';
    hM.body.appendChild(mBtn('← Geri', '#333', helpMenu));
  }
  function formView(title, ph, sendLabel, onSend) {
    hM.h.textContent = title; hM.body.innerHTML = '';
    const ta = elc('textarea'); ta.className = 'mTa'; ta.placeholder = ph; hM.body.appendChild(ta);
    const send = mBtn(sendLabel, '#2ea86a', async () => {
      const txt = ta.value.trim();
      if (txt.length < 3) { popup && popup('Lütfen biraz daha yaz', '#ffb37a'); return; }
      send.textContent = '...'; send.disabled = true; await onSend(txt);
    });
    hM.body.appendChild(send);
    hM.body.appendChild(mBtn('← Geri', '#333', helpMenu));
    setTimeout(() => ta.focus(), 100);
  }
  function bugReport() {
    if (!FB.ok) { popup && popup('İnternet gerekli', '#ffb37a'); return; }
    formView('🐞 HATA BİLDİR', 'Lütfen düzeltilmesini istediğin şeyi yaz...', 'Gönder', async txt => {
      await FB.sendReport('bug', txt);
      hM.body.innerHTML = '<div style="text-align:center;padding:20px">✅ Teşekkürler!<br>Bildirimin admin paneline düştü.</div>';
      hM.body.appendChild(mBtn('← Geri', '#333', helpMenu));
    });
  }
  function applyAdminForm() {
    if (!FB.ok) { popup && popup('İnternet gerekli', '#ffb37a'); return; }
    formView('🛡 ADMIN BAŞVURUSU', 'Neden admin olmak istiyorsun? Kendini tanıt...', 'Başvur', async txt => {
      await FB.applyAdmin(txt);
      hM.body.innerHTML = '<div style="text-align:center;padding:20px">✅ Başvurun gönderildi!<br>Kurucu inceleyip karar verecek.</div>';
      hM.body.appendChild(mBtn('← Geri', '#333', helpMenu));
    });
  }

  // ===== Destek sohbeti =====
  let supPoll = null, supBot = false, supStart = 0;
  function support() {
    if (!FB.ok) { popup && popup('İnternet gerekli', '#ffb37a'); return; }
    hM.h.textContent = '💬 DESTEK'; hM.body.innerHTML = '';
    const log = elc('div', 'height:46vh;overflow-y:auto;background:#0c0718;border-radius:10px;padding:8px;margin-bottom:8px');
    const rowW = elc('div', 'display:flex;gap:6px');
    const inp = elc('input'); inp.style.cssText = 'flex:1;border-radius:10px;border:1px solid #3a2a5a;background:#0c0718;color:#fff;padding:10px;font:400 14px "Segoe UI"'; inp.placeholder = 'Mesaj yaz...';
    const sendB = elc('button', 'background:#2ea86a;color:#fff;border:none;border-radius:10px;padding:0 14px;font:700 16px "Segoe UI";cursor:pointer', '➤');
    rowW.appendChild(inp); rowW.appendChild(sendB);
    hM.body.appendChild(log); hM.body.appendChild(rowW);
    hM.body.appendChild(mBtn('← Geri', '#333', () => { stopSup(); helpMenu(); }));
    supBot = false; supStart = Date.now(); FB.openTicket();
    async function rf() {
      const msgs = await FB.ticketMsgs(FB.uid);
      log.innerHTML = ''; let staff = false;
      for (const m of msgs) {
        if (m.from === 'admin') staff = true;
        const d = elc('div'); d.className = 'chatMsg ' + (m.from === 'user' ? 'me' : (m.from === 'bot' ? 'bot' : 'them'));
        d.textContent = (m.from === 'admin' ? '🛡 ' : (m.from === 'bot' ? '🤖 ' : '')) + m.text;
        log.appendChild(d);
      }
      log.scrollTop = log.scrollHeight;
      if (!staff && !supBot && Date.now() - supStart > 60000 && msgs.some(m => m.from === 'user')) {
        supBot = true;
        await FB.ticketSend(FB.uid, 'bot', 'Merhaba! Admin şu an müsait değil ama mesajın kaydedildi, en kısa sürede dönecek. Acil bir hata için YARDIM → Hata bildir\'i de kullanabilirsin. 🚀');
        rf();
      }
    }
    async function doSend() { const t = inp.value.trim(); if (!t) return; inp.value = ''; await FB.ticketSend(FB.uid, 'user', t); rf(); }
    sendB.onclick = doSend; inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
    rf(); stopSup(); supPoll = setInterval(rf, 4000);
  }
  function stopSup() { if (supPoll) { clearInterval(supPoll); supPoll = null; } }

  // ===== STAFF paneli =====
  const staffBtn = elc('button', null, '🛡 ADMIN'); staffBtn.id = 'staffBtn';
  document.body.appendChild(staffBtn);
  const sM = makeModal();
  staffBtn.onclick = () => { SFX.ui && SFX.ui(); staffMenu(); sM.open(); };
  function staffMenu() {
    const founder = FB.role === 'founder';
    sM.h.textContent = founder ? '👑 FOUNDER PANEL' : '🛡 ADMIN PANEL';
    sM.body.innerHTML = '';
    sM.body.appendChild(mBtn('🐞 Hata bildirimleri', '#c2461f', viewReports));
    sM.body.appendChild(mBtn('💬 Destek talepleri', '#2ea86a', viewTickets));
    sM.body.appendChild(mBtn('🔨 Ban paneli', '#8f0d20', banPanel));
    if (founder) {
      sM.body.appendChild(mBtn('🛡 Admin başvuruları', '#5a4a7a', viewAdminReqs));
      sM.body.appendChild(mBtn('👥 Adminleri yönet', '#3a5a8a', viewAdmins));
      sM.body.appendChild(mBtn('📥 Kalıcı ban istekleri', '#a03a2a', viewBanReqs));
    }
    sM.body.appendChild(mBtn('📋 UID / rol göster', '#2f6fe0', showUid));
  }
  async function viewReports() {
    sM.h.textContent = '🐞 HATA BİLDİRİMLERİ'; sM.body.innerHTML = 'Yükleniyor…';
    const list = await FB.listReports(); sM.body.innerHTML = '';
    if (!list.length) sM.body.appendChild(elc('div', 'color:#889;padding:10px', 'Bildirim yok.'));
    list.forEach(r => {
      const c = elc('div', 'background:#1a1230;border-radius:10px;padding:10px;margin:6px 0');
      c.innerHTML = '<div style="font-size:11px;color:#889">' + esc(r.name || '?') + ' · ' + fmtT(r.t) + '</div><div style="margin:4px 0">' + esc(r.text || '') + '</div>';
      if (FB.role === 'founder') { const d = elc('button', 'background:#2ea86a;color:#fff;border:none;border-radius:8px;padding:6px 10px;font:700 12px "Segoe UI";cursor:pointer', '✓ Sil'); d.onclick = async () => { await FB.resolveReport(r.id); viewReports(); }; c.appendChild(d); }
      sM.body.appendChild(c);
    });
    sM.body.appendChild(mBtn('← Geri', '#333', staffMenu));
  }
  let tPoll = null;
  async function viewTickets() {
    sM.h.textContent = '💬 DESTEK TALEPLERİ'; sM.body.innerHTML = 'Yükleniyor…';
    const list = await FB.listTickets(); sM.body.innerHTML = '';
    if (!list.length) sM.body.appendChild(elc('div', 'color:#889;padding:10px', 'Talep yok.'));
    list.forEach(t => sM.body.appendChild(mBtn('💬 ' + (t.name || '?'), '#241a3a', () => ticketChat(t))));
    sM.body.appendChild(mBtn('← Geri', '#333', staffMenu));
  }
  function ticketChat(t) {
    const tuid = t.uid || t.id;
    sM.h.textContent = '💬 ' + (t.name || '?'); sM.body.innerHTML = '';
    const log = elc('div', 'height:44vh;overflow-y:auto;background:#0c0718;border-radius:10px;padding:8px;margin-bottom:8px');
    const rowW = elc('div', 'display:flex;gap:6px');
    const inp = elc('input'); inp.style.cssText = 'flex:1;border-radius:10px;border:1px solid #3a2a5a;background:#0c0718;color:#fff;padding:10px;font:400 14px "Segoe UI"'; inp.placeholder = 'Cevap yaz...';
    const sb = elc('button', 'background:#8f0d20;color:#fff;border:none;border-radius:10px;padding:0 14px;font:700 16px "Segoe UI";cursor:pointer', '➤');
    rowW.appendChild(inp); rowW.appendChild(sb);
    sM.body.appendChild(log); sM.body.appendChild(rowW);
    sM.body.appendChild(mBtn('← Geri', '#333', () => { stopT(); viewTickets(); }));
    async function rf() {
      const msgs = await FB.ticketMsgs(tuid); log.innerHTML = '';
      for (const m of msgs) { const d = elc('div'); d.className = 'chatMsg ' + (m.from === 'admin' ? 'me' : (m.from === 'bot' ? 'bot' : 'them')); d.textContent = (m.from === 'user' ? '👤 ' : (m.from === 'bot' ? '🤖 ' : '')) + m.text; log.appendChild(d); }
      log.scrollTop = log.scrollHeight;
    }
    async function send() { const v = inp.value.trim(); if (!v) return; inp.value = ''; await FB.ticketSend(tuid, 'admin', v); rf(); }
    sb.onclick = send; inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    rf(); stopT(); tPoll = setInterval(rf, 4000);
  }
  function stopT() { if (tPoll) { clearInterval(tPoll); tPoll = null; } }
  async function banPanel() {
    sM.h.textContent = '🔨 BAN PANELİ'; sM.body.innerHTML = 'Yükleniyor…';
    FB.rowsAt = 0; FB._bansAt = 0;
    const rows = (await FB.fetchTop()) || []; const bans = await FB.fetchBans(); const admins = await FB.fetchAdmins();
    sM.body.innerHTML = '';
    sM.body.appendChild(elc('div', 'color:#9aa;margin:2px 0 6px', 'SKOR TABLOSU (' + rows.length + ')'));
    rows.slice(0, 60).forEach(r => {
      const prot = (r.id === FB.uid) || (r.id === FOUNDER_UID) || admins.has(r.id);
      const line = elc('div', 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #2a2140');
      const nm = elc('span', 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' + (r.id === FB.uid ? ';color:#ffd54d' : ''));
      nm.textContent = (r.founder ? '👑 ' : (r.admin ? '🛡 ' : '')) + r.name + ' — ' + fmt(r.s) + (r.id === FB.uid ? ' (SEN)' : '');
      line.appendChild(nm);
      if (!prot) {
        const bb = elc('button', 'background:#8f0d20;color:#fff;border:none;border-radius:8px;padding:6px 9px;font:700 12px "Segoe UI";cursor:pointer', '🔨');
        bb.onclick = async () => {
          let perm = false;
          if (FB.role === 'founder') perm = confirm('KALICI ban mı?\nTamam = kalıcı · İptal = 7 günlük geçici');
          const reason = prompt('Ban sebebi (opsiyonel):', '') || '';
          bb.textContent = '…';
          const ok = await FB.ban(r.id, { permanent: perm, days: 7, reason: reason });
          popup && popup(ok ? ('🔨 Banlandı (' + (perm ? 'kalıcı' : '7 gün') + ')') : '❌ Ban başarısız (yetki?)', ok ? '#ff8a8a' : '#ff5555');
          banPanel();
        };
        line.appendChild(bb);
        if (FB.role === 'admin') {
          const pr = elc('button', 'background:#a03a2a;color:#fff;border:none;border-radius:8px;padding:6px 8px;font:700 11px "Segoe UI";cursor:pointer;margin-left:4px', 'kalıcı iste');
          pr.onclick = async () => { const reason = prompt('Kurucuya kalıcı ban isteği — sebep:', '') || ''; if (!reason) return; const ok = await FB.requestPermBan(r.id, reason); popup && popup(ok ? '📥 İstek gönderildi' : '❌ Gönderilemedi', ok ? '#9dff70' : '#ff5555'); };
          line.appendChild(pr);
        }
      } else { line.appendChild(elc('span', 'color:#667;font-size:11px', r.id === FB.uid ? '(sen)' : (r.founder ? '(kurucu)' : '(admin)'))); }
      sM.body.appendChild(line);
    });
    const active = [...bans.entries()].filter(e => FB.banActive(e[1]));
    sM.body.appendChild(elc('div', 'color:#9aa;margin:12px 0 6px', 'BANLILAR (' + active.length + ')'));
    if (!active.length) sM.body.appendChild(elc('div', 'color:#667', 'Aktif ban yok.'));
    active.forEach(e => {
      const id = e[0], b = e[1];
      const line = elc('div', 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #2a2140');
      const nm = elc('span', 'flex:1;overflow:hidden;font-size:11px;color:#c99');
      nm.textContent = id + ' · ' + (b.permanent ? 'KALICI' : ('⏳' + Math.ceil((b.until - Date.now()) / 864e5) + 'g')) + (b.reason ? (' · ' + b.reason) : '');
      const ub = elc('button', 'background:#166b3a;color:#fff;border:none;border-radius:8px;padding:6px 9px;font:700 12px "Segoe UI";cursor:pointer', '♻️');
      ub.onclick = async () => { ub.textContent = '…'; await FB.unban(id); popup && popup('♻️ Ban kaldırıldı', '#9dff70'); banPanel(); };
      line.appendChild(nm); line.appendChild(ub); sM.body.appendChild(line);
    });
    sM.body.appendChild(mBtn('← Geri', '#333', staffMenu));
  }
  async function viewAdminReqs() {
    sM.h.textContent = '🛡 ADMIN BAŞVURULARI'; sM.body.innerHTML = 'Yükleniyor…';
    const list = await FB.listAdminReqs(); sM.body.innerHTML = '';
    if (!list.length) sM.body.appendChild(elc('div', 'color:#889;padding:10px', 'Başvuru yok.'));
    list.forEach(r => {
      const c = elc('div', 'background:#1a1230;border-radius:10px;padding:10px;margin:6px 0');
      c.innerHTML = '<div style="font-weight:700">' + esc(r.name || '?') + '</div><div style="font-size:11px;color:#889">' + fmtT(r.t) + '</div><div style="margin:6px 0">' + esc(r.reason || '') + '</div><div style="font-size:10px;color:#667">uid: ' + esc(r.id) + '</div>';
      const row = elc('div', 'display:flex;gap:6px;margin-top:6px');
      const ap = elc('button', 'flex:1;background:#2ea86a;color:#fff;border:none;border-radius:8px;padding:8px;font:700 12px "Segoe UI";cursor:pointer', '✓ Onayla');
      ap.onclick = async () => { ap.textContent = '…'; const ok = await FB.approveAdmin(r.id, r.name); popup && popup(ok ? '✓ Admin yapıldı' : '❌ Olmadı', ok ? '#9dff70' : '#ff5555'); viewAdminReqs(); };
      const rj = elc('button', 'flex:1;background:#8f0d20;color:#fff;border:none;border-radius:8px;padding:8px;font:700 12px "Segoe UI";cursor:pointer', '✕ Reddet');
      rj.onclick = async () => { await FB.rejectAdmin(r.id); viewAdminReqs(); };
      row.appendChild(ap); row.appendChild(rj); c.appendChild(row); sM.body.appendChild(c);
    });
    sM.body.appendChild(mBtn('← Geri', '#333', staffMenu));
  }
  async function viewAdmins() {
    sM.h.textContent = '👥 ADMİNLER'; sM.body.innerHTML = 'Yükleniyor…';
    const list = await FB.listAdmins(); sM.body.innerHTML = '';
    if (!list.length) sM.body.appendChild(elc('div', 'color:#889;padding:10px', 'Henüz admin yok.'));
    list.forEach(a => {
      const line = elc('div', 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #2a2140');
      const nm = elc('span', 'flex:1'); nm.innerHTML = '<span class="fbadge b-admin">🛡</span> ' + esc(a.name || 'Admin') + '<div style="font-size:10px;color:#667">' + esc(a.id) + '</div>';
      const rm = elc('button', 'background:#8f0d20;color:#fff;border:none;border-radius:8px;padding:6px 10px;font:700 12px "Segoe UI";cursor:pointer', 'çıkar');
      rm.onclick = async () => { if (!confirm('Adminlikten çıkar?')) return; await FB.removeAdmin(a.id); viewAdmins(); };
      line.appendChild(nm); line.appendChild(rm); sM.body.appendChild(line);
    });
    sM.body.appendChild(mBtn('← Geri', '#333', staffMenu));
  }
  async function viewBanReqs() {
    sM.h.textContent = '📥 KALICI BAN İSTEKLERİ'; sM.body.innerHTML = 'Yükleniyor…';
    const list = await FB.listBanReqs(); sM.body.innerHTML = '';
    if (!list.length) sM.body.appendChild(elc('div', 'color:#889;padding:10px', 'İstek yok.'));
    list.forEach(r => {
      const c = elc('div', 'background:#1a1230;border-radius:10px;padding:10px;margin:6px 0');
      c.innerHTML = '<div style="font-size:11px;color:#889">isteyen: ' + esc(r.by || '?') + ' · ' + fmtT(r.t) + '</div><div style="margin:4px 0">Hedef uid: ' + esc(r.id) + '</div><div style="color:#ffb37a">Sebep: ' + esc(r.reason || '') + '</div>';
      const row = elc('div', 'display:flex;gap:6px;margin-top:6px');
      const ap = elc('button', 'flex:1;background:#8f0d20;color:#fff;border:none;border-radius:8px;padding:8px;font:700 12px "Segoe UI";cursor:pointer', '🔨 Kalıcı banla');
      ap.onclick = async () => { ap.textContent = '…'; const ok = await FB.ban(r.id, { permanent: true, reason: r.reason }); await FB.clearBanReq(r.id); popup && popup(ok ? '🔨 Kalıcı banlandı' : '❌ Olmadı', ok ? '#ff8a8a' : '#ff5555'); viewBanReqs(); };
      const dz = elc('button', 'flex:1;background:#444;color:#fff;border:none;border-radius:8px;padding:8px;font:700 12px "Segoe UI";cursor:pointer', '✕ Yoksay');
      dz.onclick = async () => { await FB.clearBanReq(r.id); viewBanReqs(); };
      row.appendChild(ap); row.appendChild(dz); c.appendChild(row); sM.body.appendChild(c);
    });
    sM.body.appendChild(mBtn('← Geri', '#333', staffMenu));
  }
  function showUid() {
    sM.h.textContent = '📋 UID / ROL'; sM.body.innerHTML = '';
    const id = FB.uid || '(giriş yok)';
    try { navigator.clipboard && navigator.clipboard.writeText(id); } catch (e) {}
    const box = elc('div', 'background:#0c0718;border-radius:10px;padding:12px;word-break:break-all;font-size:12px');
    box.innerHTML = '<b>UID:</b><br>' + esc(id) + '<br><br><b>Rol:</b> ' + esc(FB.role) + (FB.uid === FOUNDER_UID ? ' 👑' : '') + '<br><span style="color:#889">(panoya kopyalandı)</span>';
    sM.body.appendChild(box);
    sM.body.appendChild(mBtn('← Geri', '#333', staffMenu));
  }

  // ===== butonların menüde görünmesi (oyunda gizli) =====
  window.refreshStaffUI = function () { staffBtn.textContent = FB.role === 'founder' ? '👑 FOUNDER' : '🛡 ADMIN'; };
  setInterval(function () {
    const onMenu = (typeof state !== 'undefined' && typeof S !== 'undefined' && state === S.MENU);
    helpBtn.style.display = onMenu ? 'block' : 'none';
    staffBtn.style.display = (onMenu && FB.ok && FB.isStaff()) ? 'block' : 'none';
    if (FB.ok && FB.isStaff()) staffBtn.textContent = FB.role === 'founder' ? '👑 FOUNDER' : '🛡 ADMIN';
    if (!hM.w.classList.contains('on')) stopSup();
    if (!sM.w.classList.contains('on')) stopT();
  }, 500);
})();
