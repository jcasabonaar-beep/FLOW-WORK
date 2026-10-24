"""Escenas del video '¿Qué hacían los humanos antiguos cuando se enfermaban?'.
Cada escena lleva su texto de narración; la duración sale del número de palabras."""
import math
from engine import *
from chars import person, ape, skeleton

SC = []


def scene(text, mind=3.0, extra=0.8):
    def deco(f):
        SC.append({'f': f, 'text': text, 'mind': mind, 'extra': extra, 'name': f.__name__})
        return f
    return deco


def dur(sc):
    return round(max(sc['mind'], len(sc['text'].split()) / 2.5 + sc['extra']), 2)


def shake(t, t0, d=0.4, a=8):
    if t0 <= t < t0 + d:
        return math.sin(t * 60) * a * (1 - (t - t0) / d)
    return 0.0


def banner(txt, t, t0, y=140, size=110, col=YEL):
    text(txt, 960, y, size, col, INK, sc=pop(t, t0))


# =============== HOOK ===============
@scene("Imagina que tienes fiebre. Te duele todo.")
def s01_fiebre(t, D):
    z = lerp(1.0, 1.7, ease(t / D))
    cam(z, 960, lerp(540, 380, ease(t / D)))
    bg_cave_night()
    glow(1300, 860, 380, 60, (110, 80, 50))
    fire(1300, 860, 1.0, t)
    cough = (t % 1.6) < 0.5
    dx = math.sin(t * 50) * 6 if cough else 0
    person(860, 860, 1.0, face=1, mood='sick', arms=('down', 'face') if cough else ('down', 'down'), t=t,
           head_dx=dx, extras=('sweat',))
    if cough:
        text('COF\nCOF', 1040, 360, 60, WHITE, INK, sc=pop(t % 1.6, 0, 0.2))


@scene("Y el hospital más cercano está a treinta mil años de distancia.")
def s02_hospital(t, D):
    cam(1.0, lerp(900, 1020, t / D), 540)
    bg_plain()
    person(330, 860, 0.8, mood='sick', t=t)
    hospital(1650, 860, 1.0)
    k = prog(t, 0.6, D * 0.5)
    dotted(480, 700, lerp(480, 1540, k), 700, n=max(1, int(30 * k)), r=5)
    yrs = int(30000 * k)
    text(f"{yrs:,}".replace(',', '.') + " AÑOS", 1010, 600, 90, YEL, INK, sc=pop(t, 0.6))
    if t > D * 0.75: text('?', 330, 380, 110, WHITE, INK, sc=pop(t, D * 0.75))


@scene("No hay pastillas. No hay doctores. Ni siquiera existe la palabra bacteria.")
def s03_nohay(t, D):
    bg_plain()
    person(300, 860, 0.85, mood='worried', arms=('shrug', 'shrug'), t=t)
    ts = [0.2, D * 0.3, D * 0.58]
    k = pop(t, ts[0]);
    if k: pill(800, 450, 1.1 * k);
    if t > ts[0] + 0.5: cross(800, 450, 1.2)
    k = pop(t, ts[1])
    if k: person(1180, 700, 0.55 * k, mood='happy', outfit='coat', hair='none', t=t)
    if t > ts[1] + 0.5: cross(1180, 480, 1.6)
    k = pop(t, ts[2])
    if k: text('BACTERIA', 1600, 450, 80, (120, 200, 120), INK, sc=k)
    if t > ts[2] + 0.5: cross(1600, 450, 1.8)
    if t > D - 1.0:
        text('cri... cri...', 300, 380, 46, INK, None, font='hand', sc=pop(t, D - 1.0))


@scene("Y aun así, hace más de treinta mil años, alguien le cortó una pierna a otra persona.")
def s04_cuchillo(t, D):
    bg_cave_night()
    glow(960, 860, 300, 50, (110, 80, 50))
    fire(960, 860, 0.8, t)
    t_in = D * 0.25
    scared = t > t_in + 1.2
    person(520, 860, 0.95, mood='shock' if scared else 'sick', t=t, look=(1, 0), extras=('sweat',) if scared else ())
    x2 = lerp(2100, 1420, prog(t, t_in, 1.4))
    walking = t_in < t < t_in + 1.4
    p = person(x2, 860, 0.95, face=-1, mood='grin', arms=('down', 'hold'), legs='walk' if walking else 'stand',
               walk=t * 9, t=t, seed=2)
    h = p['hands'][1]
    stone_knife(h[0], h[1] - 30, 1.2, 0.2 + math.sin(t * 3) * 0.1)
    if t > t_in + 1.6:
        text('!', 640, 440, 140, RED, INK, sc=pop(t, t_in + 1.6))


@scene("Y esa persona... sobrevivió.", mind=3.2)
def s05_sobrevivio(t, D):
    bg_paper()
    bone(700, 560, 1220, 520, w=50, callus=pop(t, 0.3))
    k = pop(t, D * 0.45, 0.3)
    text('¡SOBREVIVIÓ!', 960, 300, 140, YEL, INK, sc=k)
    if k: check(1340, 380, 1.4 * k)


@scene("¿Cómo es posible? Para entenderlo, tenemos que empezar por algo mucho más simple.")
def s06_como(t, D):
    bg_black()
    sx = shake(t, 0.2, 0.5, 14)
    text('¿CÓMO?', 960 + sx, 520, 220, YEL, INK, sc=pop(t, 0.15) * lerp(1, 0.6, prog(t, D * 0.5, 1)))
    if t > D * 0.55:
        text('empecemos por lo simple...', 960, 760, 60, WHITE, None, font='hand', sc=pop(t, D * 0.55))


# =============== 1. ANIMALES ===============
@scene("Antes de que existieran los humanos, los animales ya se automedicaban.")
def s07_auto(t, D):
    bg_savanna()
    acacia(1550, 820, 1.2)
    a = ape(760, 860, 0.9, 'chimp', 'neutral', t, arm=(150, 200))
    banner('AUTOMEDICACIÓN', t, 0.5, 150, 110)
    plant(1100, 860, 1.2, GREEN, t)


@scene("Se ha visto a chimpancés enfermos masticar plantas amargas que normalmente ni tocarían, como si supieran que eso les iba a ayudar.")
def s08_chimp(t, D):
    bg_savanna()
    plant(1250, 860, 1.4, DGREEN, t); plant(1400, 860, 1.1, GREEN, t + 1)
    m = 'chew' if t < D * 0.45 else 'yuck'
    a = ape(780, 860, 1.0, 'chimp', m, t, arm=(170, 220 + math.sin(t * 9) * 6))
    h = a['hand']
    line([h, (h[0] + 40, h[1] - 60)], 8, DGREEN)
    leaf(h[0] + 40, h[1] - 60, 0.9, -1.0, DGREEN)
    if t > D * 0.45:
        bubble(1180, 380, 300, 150, '¡PUAJ!', tail=(900, 520), size=70)
    if t > D * 0.7:
        text('...pero ayuda', 780, 260 - 0, 60, WHITE, INK, font='lucky', sc=pop(t, D * 0.7))


@scene("En 2024, unos científicos vieron a un orangután con una herida en la cara masticar una planta medicinal...")
def s09_orangutan(t, D):
    bg_jungle(t=t)
    ape(820, 880, 1.0, 'orangutan', 'chew', t, arm=(165, 215), extras={'wound': 1.0})
    k = pop(t, 0.4)
    if k:
        circ(250, 200, 110 * k, YEL, INK, 7)
        text('2024', 250, 210, 80 * k, INK, None)
    # cientifico escondido con prismaticos
    p = person(1580, 980, 0.9, face=-1, mood='shock', outfit='coat', hair='none', arms=('face', 'face'), t=t, look=(-1, 0))
    for k2 in (-1, 1):
        circ(p['head'][0] - 50 + k2 * 22, p['head'][1] - 4, 20, INK, INK, 3)
    for kx in range(4):
        leaf(1400 + kx * 90, 900, 2.0, math.radians(-120 + kx * 20), DGREEN)


@scene("...y aplicársela sobre la herida, como si fuera una pomada.")
def s10_pomada(t, D):
    bg_jungle(t=t)
    cam(1.35, 860, 470)
    rub = math.sin(t * 7) * 6
    paste = prog(t, 0.5, 1.2)
    ape(860, 880, 1.0, 'orangutan', 'neutral', t, arm=(170 + rub, 300), face=-1,
        extras={'wound': 1.0, 'paste': paste})
    text('¡POMADA!', 1250, 300, 80, YEL, INK, sc=pop(t, D * 0.45))


@scene("La herida se cerró en pocos días.")
def s11_dias(t, D):
    bg_paper()
    for i, (lbl, w) in enumerate((('DÍA 1', 1.0), ('DÍA 3', 0.55), ('DÍA 5', 0.0))):
        k = pop(t, 0.2 + i * D * 0.25)
        if not k: continue
        x = 400 + i * 560
        rect(x - 230, 220, 460, 560, WHITE, INK, 6)
        cam(1, 960, 540)
        ape(x, 780, 0.75 * k, 'orangutan', 'happy' if i == 2 else 'neutral', t, extras={'wound': w})
        text(lbl, x, 300, 60, YEL, INK)
        if i == 2: text('✓', x + 150, 420, 90, GREEN, INK, font='hand')


@scene("Así que cuando aparecieron los primeros humanos, el instinto de curarse ya venía de fábrica.")
def s12_fabrica(t, D):
    bg_jungle(t=t)
    ape(1350, 880, 0.8, 'orangutan', 'happy', t, face=-1)
    p = person(620, 880, 0.95, mood='neutral', arms=('hold', 'front'), t=t, look=(1, 0))
    h = p['hands'][0]
    rect(h[0] - 70, h[1] - 50, 110, 140, LSTONE, INK, 5)
    for i in range(int(prog(t, 0.5, D * 0.5) * 4)):
        line([(h[0] - 55, h[1] - 25 + i * 26), (h[0] + 20, h[1] - 25 + i * 26)], 4, INK)
    k = pop(t, D * 0.65, 0.25)
    if k:
        text('DE FÁBRICA', 960, 220, 120 * (2 - k), RED, INK, sw=10)


@scene("Lo que vino después fue mucho más interesante.", mind=2.8)
def s13_interesante(t, D):
    cam(lerp(1.0, 1.8, ease(t / D)), 960, lerp(540, 380, ease(t / D)))
    bg_plain()
    person(960, 860, 1.0, mood='skeptic', t=t)


# =============== 2. FARMACIA ===============
@scene("Los humanos antiguos no tenían farmacias... pero vivían rodeados de una.")
def s14_farmacia(t, D):
    bg_savanna()
    tree(1450, 820, 1.2)
    sign(1150, 820, 380, 120, 'FARMACIA', 52, col=(150, 210, 140))
    plant(1650, 820, 1.0, GREEN, t); plant(1750, 830, 0.8, DGREEN, t + 2)
    mushroom_bracket(1450, 640, 1.2)
    for i in range(4): berry(1360 + i * 40, 560 + (i % 2) * 30)
    person(520, 860, 1.0, mood='happy' if t > D * 0.5 else 'neutral', arms=('down', 'point') if t > D * 0.5 else ('down', 'down'), t=t)


@scene("En una cueva de España llamada El Sidrón, se encontraron restos de un neandertal...")
def s15_sidron(t, D):
    bg_savanna(ground=860)
    cave_entrance(960, 860, 1.2)
    sign(1550, 860, 420, 80, 'EL SIDRÓN · ESPAÑA', 38)
    text('~49.000 AÑOS', 960, 150, 100, YEL, INK, sc=pop(t, D * 0.4))


@scene("con un absceso dental y un parásito intestinal. Un día terrible.")
def s16_absceso(t, D):
    bg_cave_night()
    p = person(860, 860, 1.05, mood='pain', arms=('face', 'down'), t=t, extras=('swollen', 'brow'), face=-1,
               head_dx=math.sin(t * 30) * 2)
    k = pop(t, D * 0.35)
    if k:
        circ(860, 640, 75 * k, (255, 230, 230), INK, 5)
        worm(830, 640, 1.2 * k, t)
        text('PARÁSITO', 1120, 640, 54, WHITE, INK, sc=k)
    text('ABSCESO', 560, 300, 54, WHITE, INK, sc=pop(t, 0.3))
    arrow(640, 330, 720, 420, 7, WHITE)
    banner('UN DÍA TERRIBLE', t, D * 0.72, 140, 100, RED)


@scene("Al analizar el sarro de sus dientes, los científicos encontraron rastros de álamo, que contiene ácido salicílico: el mismo principio de la aspirina.")
def s17_sarro(t, D):
    bg_paper()
    tooth(1000, 520, 1.6)
    p = person(420, 900, 0.95, mood='shock' if t > D * 0.4 else 'neutral', outfit='coat', hair='none',
               arms=('down', 'hold'), t=t, look=(1, 0))
    h = p['hands'][1]
    magnifier(h[0] + 60 + math.sin(t * 2) * 30, h[1] - 60, 1.0)
    k = pop(t, D * 0.4)
    if k:
        leaf(1330, 320, 1.6 * k, -0.5, GREEN)
        text('ÁLAMO', 1600, 260, 70, GREEN, INK, sc=k)
    k = pop(t, D * 0.65)
    if k:
        arrow(1560, 330, 1560, 440, 8)
        text('ÁCIDO\nSALICÍLICO', 1580, 540, 60, YEL, INK, sc=k)
        text('= ASPIRINA', 1580, 700, 60, WHITE, INK, sc=pop(t, D * 0.8))


@scene("Y también, restos de un moho relacionado con la penicilina.")
def s18_moho(t, D):
    bg_paper()
    tooth(900, 520, 1.6)
    k = prog(t, 0.3, 1.5)
    for i, (dx, dy) in enumerate(((-60, 0), (40, 10), (-10, 4), (80, -2), (-100, 8))):
        circ(900 + dx, 520 + dy, 14 * k, (120, 190, 90), INK, 3)
    text('MOHO', 1450, 380, 90, (120, 190, 90), INK, sc=pop(t, 0.6))
    text('≈ PENICILINA', 1450, 520, 70, YEL, INK, sc=pop(t, D * 0.5))


@scene("No sabemos si lo hacía a propósito. Pero este tipo tenía aspirina y algo parecido a un antibiótico en la boca...")
def s19_wink(t, D):
    bg_cave_night()
    cam(lerp(1.0, 1.25, ease(t / D)), 900, 480)
    w = t > D * 0.5
    p = person(860, 860, 1.05, mood='wink' if w else 'skeptic', arms=('down', 'hold'), t=t, extras=('brow',))
    h = p['hands'][1]
    bottle(h[0] + 20, h[1] + 60, 1.1, 'ASPIRINA 1.0')
    if w: text('¿ACCIDENTE?', 1350, 300, 70, WHITE, INK, sc=pop(t, D * 0.5))


@scene("...unos cuarenta mil años antes de que los inventáramos.")
def s20_timeline(t, D):
    bg_paper()
    line([(200, 600), (1720, 600)], 10)
    person(260, 560, 0.5, mood='wink', t=t, extras=('brow',))
    text('NEANDERTAL', 260, 680, 44, INK, None)
    pill(1660, 420, 0.8)
    text('HOY', 1660, 680, 44, INK, None)
    k = prog(t, 0.3, D * 0.6)
    arrow(360, 760, lerp(360, 1560, k) + 1, 760, 8, RED)
    text('≈ 40.000 AÑOS ANTES', 960, 250, 100, YEL, INK, sc=pop(t, D * 0.35))


@scene("Y luego está Ötzi, el hombre de hielo, que murió en los Alpes hace unos cinco mil trescientos años.")
def s21_otzi(t, D):
    bg_mountain()
    rect(560, 760, 800, 150, ICE, INK, 6)
    G.rot = (-math.pi / 2, 1250, 835)
    person(1250, 835, 0.85, mood='sleep', t=t, bob=False, blink=False, arms=('down', 'down'))
    G.rot = None
    for i in range(6):
        line([(600 + i * 130, 780), (640 + i * 130, 800)], 4, WHITE)
    text('ÖTZI', 960, 200, 130, YEL, INK, sc=pop(t, 0.4))
    text('5.300 AÑOS', 960, 340, 80, WHITE, INK, sc=pop(t, D * 0.55))


@scene("Entre sus cosas llevaba un hongo atado con una cuerda: un hongo que puede ayudar contra los parásitos intestinales.")
def s22_hongo(t, D):
    bg_mountain()
    p = person(700, 880, 1.0, mood='happy', arms=('down', 'hold'), t=t, extras=('beard',))
    h = p['hands'][1]
    line([h, (h[0] + 20, h[1] + 120)], 4, DBROWN, amp=0.5)
    mushroom_bracket(h[0] + 20, h[1] + 130, 1.1)
    mushroom_bracket(h[0] + 25, h[1] + 200, 0.9)
    k = pop(t, D * 0.5)
    if k:
        circ(1350, 560, 160 * k, (255, 230, 230), INK, 6)
        for i in range(3):
            run = prog(t, D * 0.65, 1.5) * 200
            worm(1280 + i * 30 + run, 500 + i * 50, 1.3, t + i, face=1)
        text('¡HUYAN!', 1350, 330, 64, WHITE, INK, sc=pop(t, D * 0.7))


@scene("Y Ötzi tenía parásitos. Es decir... llevaba su botiquín de viaje.")
def s23_botiquin(t, D):
    bg_mountain()
    cam(lerp(1.0, 1.15, t / D), 960, 540)
    p = person(760, 880, 1.0, mood='happy_closed' if t > D * 0.5 else 'happy', arms=('down', 'hold'), t=t, extras=('beard',))
    h = p['hands'][1]
    kit(h[0] + 40, h[1] + 40, 0.9)
    if t > D * 0.45:
        bubble(1300, 350, 460, 180, 'Siempre preparado.', tail=(900, 470), size=56)


# =============== INTERRUPCION ===============
@scene("Claro... ¿cómo sabían qué planta curaba y cuál te mataba?")
def s24_baya(t, D):
    bg_savanna()
    green = t > D * 0.5
    p = person(900, 860, 1.05, mood='sick' if green else 'chew', arms=('down', 'face'), t=t,
               headcol=(150, 210, 120) if green else WHITE, head_dx=math.sin(t * 20) * 3 if green else 0)
    h = p['hands'][1]
    if not green: berry(h[0], h[1], 16)
    for i in range(5): berry(1350 + i * 34, 700 + (i % 2) * 26)
    plant(1420, 860, 1.0, GREEN, t)
    if green: text('?', 1150, 380, 140, YEL, INK, sc=pop(t, D * 0.55))


@scene("Exacto. Prueba y error. Muchos errores.")
def s25_prueba(t, D):
    bg_savanna()
    banner('PRUEBA Y ERROR', t, 0.2, 150, 110)
    fall = prog(t, D * 0.35, 0.6)
    G.rot = (fall * math.pi / 2, 480, 880)
    person(480, 880, 0.8, mood='faint' if fall > 0.1 else 'chew', t=t, arms=('down', 'face'))
    G.rot = None
    for i in range(3):
        x = 900 + i * 300
        p = person(x, 880, 0.8, face=-1, mood='shock' if fall > 0.5 else 'neutral', arms=('hold', 'front'), t=t, seed=i + 1)
        h = p['hands'][0]
        rect(h[0] - 50, h[1] - 40, 80, 100, LSTONE, INK, 4)
        if fall > 0.5:
            line([(h[0] - 40, h[1] - 10), (h[0] + 20, h[1] - 10)], 4)
            cross(h[0] - 10, h[1] + 25, 0.25)


@scene("Cada remedio que funcionó lo pagaron generaciones de gente muy valiente... o muy hambrienta.")
def s26_hambre(t, D):
    bg_savanna()
    p = person(760, 860, 1.05, mood='chew', arms=('face', 'hold'), t=t)
    h = p['hands'][1]
    mushroom_bracket(h[0], h[1], 1.0)
    text('GRRR', 760, 520, 50, WHITE, INK, sc=pop((t % 1.5), 0, 0.2))
    text('VALIENTE', 1400, 340, 80, YEL, INK, sc=pop(t, D * 0.35))
    k = pop(t, D * 0.65)
    if k:
        text('...O HAMBRIENTO', 1400, 480, 70, ORANGE, INK, sc=k)


# =============== CTA ===============
@scene("Si te está gustando, suscríbete. Al cavernícola le cuesta mucho dibujarse a sí mismo.", mind=6)
def s27_cta(t, D):
    bg_cave_night()
    done = t > D * 0.35
    p = person(560, 860, 1.0, mood='happy', arms=('down', 'point'), t=t)
    h = p['hands'][1]
    line([h, (h[0] + 230, h[1] - 60)], 9, BROWN)
    sub_button(1200, 420, 1.2 if not (D * 0.33 < t < D * 0.37) else 1.1, done)
    k = prog(t, D * 0.5, D * 0.45)
    if k:
        x0, y0 = 1250, 640
        pts = [(x0, y0 - 50), (x0 + 30, y0 - 80), (x0 + 60, y0 - 50), (x0 + 30, y0 - 20), (x0, y0 - 50)]
        n = max(2, int(len(pts) * k))
        line(pts[:n], 6, WHITE)
        if k > 0.4: line([(x0 + 30, y0 - 20), (x0 + 30, y0 + 50)], 6, WHITE)
        if k > 0.6: line([(x0 + 30, y0 + 50), (x0 + 5, y0 + 100)], 6, WHITE)
        if k > 0.8: line([(x0 + 30, y0 + 50), (x0 + 55, y0 + 100)], 6, WHITE)
        if k > 0.9: text('yo', x0 + 120, y0, 46, WHITE, None, font='hand')


# =============== 3. CUIDADOS ===============
@scene("En una cueva de Irak llamada Shanidar, se encontró a un neandertal que había sufrido golpes terribles:")
def s28_shanidar(t, D):
    bg_savanna(ground=860)
    cave_entrance(900, 860, 1.2, col=(180, 150, 110))
    sign(1560, 860, 420, 80, 'SHANIDAR · IRAK', 40)
    text('NEANDERTAL', 900, 150, 100, YEL, INK, sc=pop(t, D * 0.45))


@scene("un brazo inutilizado, probablemente ciego de un ojo, y con problemas para caminar.")
def s29_herido(t, D):
    bg_plain()
    lim = math.sin(t * 4)
    p = person(900, 860, 1.05, mood='sad', arms=('front', ('hold_low')), t=t, extras=('bandage', 'eyepatch', 'brow'),
               head_dy=abs(lim) * 6)
    h = p['hands'][1]
    line([(h[0], h[1] - 10), (h[0] + 10, 860)], 10, BROWN)
    line([(h[0] - 25, h[1] - 10), (h[0] + 25, h[1] - 10)], 10, BROWN)
    labels = [('BRAZO', 480, 560, 820, 640), ('OJO', 520, 260, 860, 380), ('PIERNA', 1400, 560, 980, 760)]
    for i, (lb, lx, ly, ax, ay) in enumerate(labels):
        k = pop(t, 0.3 + i * D * 0.26)
        if k:
            text(lb, lx, ly, 60, WHITE, INK, sc=k)
            arrow(lx + (60 if lx < 900 else -60), ly + 30, ax, ay, 6, INK)


@scene("Con esas heridas, solo, no habría durado ni una semana.")
def s30_semana(t, D):
    bg_savanna()
    person(800, 860, 0.95, mood='worried', arms=('front', 'hold_low'), t=t, extras=('bandage', 'eyepatch', 'brow', 'sweat'))
    for i in range(3):
        a = t * 0.8 + i * 2.1
        bird(800 + math.cos(a) * 260, 250 + math.sin(a) * 60, 1.2, t + i)
    rect(1300, 380, 440, 300, WHITE, INK, 6)
    text('SEMANA 1', 1520, 430, 46, INK, None)
    for d in range(7):
        x, y = 1350 + (d % 4) * 100, 520 + (d // 4) * 90
        rect(x - 30, y - 30, 60, 60, None, INK, 3)
        if t > 0.4 + d * (D * 0.7 / 7): cross(x, y, 0.32)


@scene("Pero sus huesos muestran que vivió muchos años después.")
def s31_anios(t, D):
    bg_paper()
    yrs = int(prog(t, 0.4, D * 0.6) * 15)
    rect(1180, 300, 420, 360, WHITE, INK, 6)
    rect(1180, 300, 420, 90, RED, INK, 6)
    text('AÑOS', 1390, 350, 54, WHITE, None)
    text(f'+{yrs}', 1390, 530, 150, INK, None)
    bone(300, 560, 820, 520, w=46, callus=1.0)
    text('HUESOS CURADOS', 560, 380, 60, YEL, INK, sc=pop(t, 0.3))


@scene("Alguien le dio comida. Alguien lo protegió. Alguien lo esperó cuando caminaba lento.")
def s32_alguien(t, D):
    bg_savanna()
    walkp = t > D * 0.66
    off = (t - D * 0.66) * 60 if walkp else 0
    rect_raw(-400, 0, -399, 1, SKY)
    r = 0
    p = person(900, 880, 0.9, mood='happy' if t > D * 0.2 else 'sad', arms=('front', 'hold_low'), t=t,
               extras=('bandage', 'eyepatch', 'brow'), legs='walk' if walkp else 'stand', walk=t * 3)
    h = p['hands'][1]
    line([(h[0], h[1] - 10), (h[0] + 10, 880)], 10, BROWN)
    k = prog(t, 0.2, 0.8)
    if k:
        q = person(lerp(-100, 560, k), 880, 0.9, mood='happy', arms=('down', 'hold'), t=t, seed=1,
                   legs='walk' if (k < 1 or walkp) else 'stand', walk=t * 4)
        hh = q['hands'][1]
        if t < D * 0.66: meat(hh[0] + 30, hh[1], 0.8)
    k = prog(t, D * 0.33, 0.8)
    if k:
        q = person(lerp(2100, 1300, k), 880, 0.9, face=-1, mood='angry', arms=('down', 'hold'), t=t, seed=2,
                   legs='walk' if (k < 1 or walkp) else 'stand', walk=t * 4, extras=('brow',))
        hh = q['hands'][1]
        spear(hh[0], hh[1] + 80, hh[0] + 10, hh[1] - 150)
    lbls = ['COMIDA', 'PROTECCIÓN', 'PACIENCIA']
    for i, lb in enumerate(lbls):
        tt = [0.3, D * 0.36, D * 0.68][i]
        text(lb, 480 + i * 480, 140, 70, YEL, INK, sc=pop(t, tt))


@scene("Se suele contar que la antropóloga Margaret Mead dijo que el primer signo de civilización no fue una herramienta, ni una vasija...")
def s33_mead(t, D):
    bg_plain()
    person(360, 860, 1.0, mood='neutral', outfit='coat', hair='long', arms=('down', 'point'), t=t)
    text('1er SIGNO DE\nCIVILIZACIÓN', 1150, 220, 80, YEL, INK, sc=pop(t, 0.3))
    k = pop(t, D * 0.5)
    if k:
        spear(850, 700, 1050, 520, 1.0 * k)
        if t > D * 0.6: cross(960, 600, 1.4)
    k = pop(t, D * 0.72)
    if k:
        pot(1450, 720, 1.3 * k)
        if t > D * 0.82: cross(1450, 640, 1.4)


@scene("...sino un hueso de pierna fracturado y curado.")
def s34_hueso(t, D):
    bg_paper()
    gap = 40 * (1 - prog(t, D * 0.35, 0.8)) if t > 0.3 else 0
    crack = 1 if t > 0.1 else 0
    bone(560, 560, 1360, 540, w=60, gap=gap, callus=prog(t, D * 0.55, 0.6))
    if t < 0.3 + D * 0.35: text('CRACK', 960, 320, 90, RED, INK, sc=pop(t, 0.3))
    k = pop(t, D * 0.65)
    if k:
        text('CURADO', 960, 320, 110, GREEN, INK, sc=k)
        check(1220, 300, 1.2 * k)


@scene("Porque en la naturaleza, si te rompes una pierna, mueres. Si se curó, es que alguien se quedó contigo.")
def s35_fogata(t, D):
    cam(lerp(1.0, 1.3, ease(t / D)), 960, 600)
    bg_cave_night()
    rect_raw(-400, -400, 2400, 60, NIGHT)
    stars(3, 30, 60)
    glow(960, 860, 520, 70, (100, 72, 46))
    fire(960, 860, 0.9, t)
    person(560, 860, 0.85, mood='happy', arms=('front', 'down'), t=t, extras=('bandage', 'eyepatch', 'brow'), legs='sit')
    person(1360, 860, 0.85, face=-1, mood='happy_closed', t=t, seed=1, legs='sit', arms=('down', 'hold_low'))
    person(1640, 860, 0.8, face=-1, mood='happy', t=t, seed=2, hair='long', legs='sit')
    if t > D * 0.6: heart(960, 380, 1.4 * pop(t, D * 0.6) * (1 + 0.06 * math.sin(t * 6)))


@scene("Bueno... también es probable que lo cuidaran porque era el único que sabía hacer fuego. No todo es amor.")
def s36_fuego(t, D):
    bg_cave_night()
    rub = math.sin(t * 16) * 10
    p = person(820, 860, 1.0, mood='happy', arms=('front', 'front'), t=t, extras=('bandage', 'eyepatch', 'brow'))
    line([(860 + rub, 700), (880 - rub, 840)], 8, BROWN)
    if t > D * 0.3:
        fire(880, 870, 0.6 * prog(t, D * 0.3, 0.6) + 0.01, t)
    for i, x in enumerate((1300, 1560)):
        person(x, 860, 0.85, face=-1, mood='happy', t=t, seed=i + 3, extras=('heart_eyes',))
    text('EL ÚNICO QUE\nHACÍA FUEGO', 960, 200, 80, YEL, INK, sc=pop(t, D * 0.35))
    text('NO TODO ES AMOR', 960, 980, 60, WHITE, INK, sc=pop(t, D * 0.8))


# =============== 4. CIRUGIA ===============
@scene("Y ahora sí: volvamos a la pregunta del principio.", mind=3.2)
def s37_volver(t, D):
    bg_black()
    cam(lerp(1.0, 1.6, ease(t / D)), 960, 540)
    stone_knife(960, 560, 3.0, 0.3 + math.sin(t * 2) * 0.05)
    cam(1, 960, 540)
    text('LA CIRUGÍA', 960, 180, 100, YEL, INK, sc=pop(t, 0.3))


@scene("En una cueva de Borneo se encontró el esqueleto de una persona joven, de hace unos treinta y un mil años.")
def s38_borneo(t, D):
    bg_jungle(t=t)
    cave_entrance(900, 850, 1.1, col=(120, 140, 100))
    sign(1560, 850, 420, 80, 'BORNEO', 50)
    text('31.000 AÑOS', 900, 150, 110, YEL, INK, sc=pop(t, D * 0.55))


@scene("Le faltaba la parte de abajo de la pierna izquierda.")
def s39_esqueleto(t, D):
    rect_raw(-400, -400, 2400, 1500, (205, 175, 130))
    r = __import__('random').Random(5)
    for i in range(30):
        dot(r.uniform(0, 1920), r.uniform(0, 1080), r.uniform(3, 8), (180, 150, 110))
    skeleton(960, 620, 1.2)
    if t > D * 0.35:
        dashed_circle(1440, 668, 130)
        text('¿?', 1440, 668, 90, RED, INK, sc=pop(t, D * 0.4))


@scene("Pero no la perdió por un animal ni por un accidente. El corte era limpio y preciso. Alguien se la amputó a propósito.")
def s40_corte(t, D):
    bg_paper()
    k = pop(t, 0.2)
    if k:
        text('ANIMAL', 400, 260, 70, ORANGE, INK, sc=k)
        if t > 0.8: cross(400, 260, 1.2)
    k = pop(t, D * 0.18)
    if k:
        text('ACCIDENTE', 400, 470, 70, ORANGE, INK, sc=k)
        if t > D * 0.18 + 0.6: cross(400, 470, 1.2)
    bone(900, 640, 1500, 640, w=56)
    rect_raw(1460, 560, 1700, 720, CREAM)
    line([(1450, 600), (1450, 680)], 8, RED)
    k = pop(t, D * 0.4)
    if k:
        magnifier(1440, 640, 1.6 * k)
        text('CORTE LIMPIO', 1300, 330, 80, YEL, INK, sc=pop(t, D * 0.5))
    text('A PROPÓSITO', 1250, 900, 90, RED, INK, sc=pop(t, D * 0.78))


@scene("Y aquí viene lo increíble:", mind=2.4)
def s41_increible(t, D):
    cam(lerp(1.0, 1.9, ease(t / 0.6)), 960, 400)
    bg_plain()
    person(960, 860, 1.0, mood='shock', t=t, head_dx=shake(t, 0.2, 0.5, 8))
    text('¡¿QUÉ?!', 1160, 280, 70, YEL, INK, sc=pop(t, 0.4))


@scene("el hueso cicatrizó. Esa persona vivió entre seis y nueve años más, con una sola pierna, en una selva montañosa.")
def s42_vivio(t, D):
    bg_jungle(t=t)
    x = lerp(500, 1300, t / D)
    p = person(x, 870, 1.0, mood='happy', arms=('down', 'hold_low'), t=t, legs_lost=(0,),
               head_dy=abs(math.sin(t * 4)) * 8)
    h = p['hands'][1]
    line([(h[0], h[1] - 10), (h[0] + 10, 870)], 10, BROWN)
    line([(h[0] - 25, h[1] - 10), (h[0] + 25, h[1] - 10)], 10, BROWN)
    text('+6 A 9 AÑOS', 960, 160, 120, YEL, INK, sc=pop(t, D * 0.25))


@scene("Para hacer eso necesitaban: saber dónde cortar sin que el paciente se desangrara, evitar una infección mortal sin antibióticos, y cuidarlo durante meses mientras se recuperaba.")
def s43_lista(t, D):
    bg_paper()
    rect(300, 160, 1320, 780, (255, 250, 238), INK, 7)
    text('NECESITABAN:', 960, 250, 90, INK, None)
    items = ['Cortar sin desangrarlo', 'Evitar la infección', 'Cuidarlo durante meses']
    for i, it in enumerate(items):
        t0 = D * (0.12 + i * 0.28)
        y = 420 + i * 170
        rect(400, y - 45, 90, 90, WHITE, INK, 6)
        if t > t0 + 0.6: check(445, y, 1.0 * pop(t, t0 + 0.6))
        text(it, 540, y, 70, INK, None, font='hand', anchor='lm', sc=pop(t, t0))


@scene("Probablemente usaban plantas de la selva con propiedades antisépticas.")
def s44_plantas(t, D):
    bg_jungle(t=t)
    person(700, 870, 0.95, mood='sad', t=t, legs_lost=(1,), arms=('down', 'down'))
    p = person(1150, 870, 0.95, face=-1, mood='happy', arms=('hold_low', 'down'), t=t, seed=2, hair='long')
    h = p['hands'][0]
    leaf(h[0] - 20, h[1], 1.2, math.pi + math.sin(t * 4) * 0.2, GREEN)
    text('ANTISÉPTICO NATURAL', 960, 160, 90, YEL, INK, sc=pop(t, D * 0.4))


@scene("Hasta ese hallazgo, se pensaba que la primera amputación tenía unos siete mil años. Este descubrimiento la adelantó más de veinte mil.")
def s45_linea(t, D):
    bg_paper()
    line([(200, 600), (1720, 600)], 12)
    for i, (lb, x) in enumerate((('31.000', 300), ('20.000', 800), ('7.000', 1350), ('HOY', 1650))):
        line([(x, 580), (x, 620)], 8)
        text(lb, x, 670, 46, INK, None)
    k = prog(t, D * 0.5, 1.4)
    mx = lerp(1350, 300, k)
    poly([(mx, 570), (mx - 30, 500), (mx + 30, 500)], RED, INK, 5)
    text('1ª AMPUTACIÓN', mx, 450, 50, RED, INK, sc=1)
    if k >= 1:
        text('+24.000 AÑOS', 960, 230, 110, YEL, INK, sc=pop(t, D * 0.5 + 1.4))


@scene("Y no fue lo único. Miles de años después, en el Neolítico, los humanos hacían agujeros en el cráneo de personas vivas. Se llama trepanación.")
def s46_trepan(t, D):
    bg_cave_night()
    p = person(700, 860, 1.0, mood='grin', arms=('down', 'hold'), t=t)
    h = p['hands'][1]
    skull(h[0] + 90, h[1] - 40, 1.1, hole=1.0)
    person(1400, 860, 0.95, face=-1, mood='shock', t=t, seed=2, extras=('sweat',))
    banner('TREPANACIÓN', t, D * 0.75, 150, 120)


@scene("Y muchas de esas calaveras muestran el hueso regenerado alrededor del agujero. O sea... el paciente sobrevivió.")
def s47_regenerado(t, D):
    bg_paper()
    cam(1.6, 900, 450)
    skull(900, 520, 1.6, hole=1.4, healed=prog(t, 0.6, D * 0.4))
    if t > D * 0.6:
        cam(1, 960, 540)
        person(1600, 900, 0.75, face=-1, mood='happy', arms=('down', 'thumb'), t=t, extras=('headband',))
        text('¡SOBREVIVIÓ!', 1400, 170, 80, YEL, INK, sc=pop(t, D * 0.65))


@scene("¿Por qué lo hacían? Quizá por dolores de cabeza, o golpes. Quizá para sacar a los malos espíritus. Nunca lo sabremos.")
def s48_porque(t, D):
    bg_plain()
    p = person(960, 880, 0.95, mood='skeptic', t=t, extras=('headband',), arms=('down', 'face'))
    ideas = [('⚡', 'DOLOR', 520), ('🪨', 'GOLPE', 960), ('👻', 'ESPÍRITUS', 1400)]
    for i, (_, lb, x) in enumerate(ideas):
        k = pop(t, 0.4 + i * D * 0.22)
        if not k: continue
        thought(x, 220, 300 * k, 180 * k, (960 + (x - 960) * 0.2, 470))
        text(lb, x, 225, 50, INK, None, sc=k)
    if t > D * 0.8:
        text('???', 960, 470, 90, YEL, INK, sc=pop(t, D * 0.8))


# =============== 5. CHAMAN ===============
@scene("Cuando algo no tenía explicación, como una fiebre que no bajaba, entraba en escena el chamán.")
def s49_chaman(t, D):
    bg_cave_night()
    fire(960, 860, 1.0, t)
    person(450, 860, 0.9, mood='sick', t=t, extras=('sweat',))
    k = prog(t, D * 0.45, 1.0)
    if k:
        a = t * 2.5
        x = lerp(2100, 1350, k) + (math.sin(a) * 60 if k >= 1 else 0)
        person(x, 860 - abs(math.sin(a * 2)) * 30, 1.0, face=-1, mood='grin', outfit='shaman', hair='none',
               arms=('up', ('wave')), t=t, seed=5)
        text('EL CHAMÁN', 1350, 150, 100, YEL, INK, sc=pop(t, D * 0.55))
    smoke(960, 700, t, 1.4)


@scene("Cantos, humo, rituales. Suena a superstición...")
def s50_ritual(t, D):
    bg_cave_night()
    fire(1100, 860, 0.9, t)
    smoke(1100, 700, t, 1.6)
    notes(1300, 400, t, 1.2)
    a = t * 3
    person(1450, 860 - abs(math.sin(a * 2)) * 30, 0.95, face=-1, mood='grin', outfit='shaman', hair='none',
           arms=('up', 'up' if math.sin(a * 2) > 0 else 'shrug'), t=t, seed=5)
    person(600, 860, 0.95, mood='skeptic', t=t, look=(1, 0))
    for i, w in enumerate(('CANTOS', 'HUMO', 'RITUALES')):
        text(w, 440 + i * 520, 140, 70, WHITE, INK, sc=pop(t, 0.1 + i * D * 0.2))


@scene("...pero no era del todo inútil. El ritual calmaba al enfermo, unía al grupo y, a veces, venía acompañado de plantas que sí funcionaban.")
def s51_util(t, D):
    bg_cave_night()
    glow(960, 860, 520, 70, (100, 72, 46))
    fire(960, 860, 0.8, t)
    person(560, 860, 0.85, mood='happy_closed' if t > D * 0.2 else 'sick', t=t, legs='sit')
    person(1360, 860, 0.9, face=-1, mood='happy', outfit='shaman', hair='none', t=t, seed=5, arms=('down', 'hold'))
    person(1700, 860, 0.8, face=-1, mood='happy', t=t, seed=2, legs='sit', hair='long')
    for i, (lb, x) in enumerate((('CALMA', 480), ('GRUPO', 960), ('PLANTAS', 1440))):
        k = pop(t, D * (0.18 + i * 0.25))
        if k:
            text(lb, x, 180, 70, YEL, INK, sc=k)
            check(x, 290, 0.8 * k)


@scene("En cierto modo, el chamán fue el primer médico, el primer psicólogo y el primer farmacéutico. Todo en uno.")
def s52_medico(t, D):
    bg_plain()
    person(700, 860, 1.0, mood='happy', outfit='coat', hair='none', t=t, arms=('down', 'hips'))
    person(1250, 860, 1.0, face=-1, mood='wink', outfit='shaman', hair='none', t=t, seed=5, arms=('hips', 'down'))
    for i, lb in enumerate(('MÉDICO', 'PSICÓLOGO', 'FARMACÉUTICO')):
        text(lb, 1650, 300 + i * 110, 56, YEL, INK, sc=pop(t, D * (0.15 + i * 0.17)))
    if t > D * 0.7:
        bubble(1250, 220, 440, 160, 'Eso lo inventé yo.', tail=(1250, 420), size=52)


# =============== CIERRE ===============
@scene("Así que, ¿qué hacían los humanos antiguos cuando se enfermaban? Masticaban plantas, llevaban botiquines de hongos, operaban con piedras... y, sobre todo, se cuidaban entre ellos.")
def s53_resumen(t, D):
    bg_cave_night()
    glow(960, 880, 560, 70, (100, 72, 46))
    fire(960, 880, 0.9, t)
    for i, (x, f, h) in enumerate(((420, 1, 'cave'), (640, 1, 'long'), (1280, -1, 'cave'), (1500, -1, 'long'))):
        person(x, 880, 0.75, face=f, mood='happy', t=t, seed=i, hair=h, legs='sit')
    icons = [D * 0.3, D * 0.45, D * 0.6, D * 0.78]
    k = pop(t, icons[0]);  k and leaf(330, 250, 1.8 * k, -0.4, GREEN)
    k = pop(t, icons[1]);  k and mushroom_bracket(760, 260, 2.0 * k)
    k = pop(t, icons[2]);  k and stone_knife(1160, 260, 1.6 * k, 0.4)
    k = pop(t, icons[3]);  k and heart(1600, 250, 2.6 * k * (1 + 0.06 * math.sin(t * 6)))


@scene("Pero había algo que ni las plantas ni el chamán podían curar. Algo que mató a más humanos antiguos que cualquier depredador...")
def s54_oscuro(t, D):
    bg_cave_night()
    sneeze = D * 0.45
    on = 1.0 if t < sneeze else max(0.0, 1 - (t - sneeze) / 0.4)
    fire(1100, 860, 0.9, t, on=on)
    person(700, 860, 1.0, mood='shock' if t > sneeze else 'sick', t=t,
           head_dx=shake(t, sneeze, 0.4, 12), arms=('down', 'face') if t < sneeze else ('down', 'down'))
    if sneeze <= t < sneeze + 1.0:
        text('¡ACHÚ!', 1000, 420, 110, WHITE, INK, sc=pop(t, sneeze, 0.2))
    if t > sneeze + 0.4:
        dark = prog(t, sneeze + 0.4, 0.8)
        if dark > 0.95:
            bg_black()
            for k in (-1, 1): dot(720 + k * 22, 486, 9, WHITE)
        text('¿QUÉ PODRÍA SER?', 960, 900, 80, RED, INK, sc=pop(t, D * 0.75))


@scene("Y de eso hablamos en este video.", mind=12)
def s55_final(t, D):
    bg_plain()
    rect(960, 220, 800, 450, (40, 40, 44), INK, 8)
    text('SIGUIENTE\nVIDEO', 1360, 445, 90, WHITE, None)
    p = person(480, 860, 1.0, mood='happy', arms=('down', 'point'), t=t)
    arrow(640, 520, 900, 450, 10, INK)
    circ(1650, 870, 110, (60, 60, 64), INK, 8)
    text('SUSCRÍBETE', 1650, 1020, 46, INK, None)
