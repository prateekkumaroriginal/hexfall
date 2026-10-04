"""Fresh Blender sculpture. No mesh from the rejected orc is loaded or reused.

blender --background --factory-startup --python scripts/build-orc-replacement.py
Pass -- --anatomy to inspect the unclothed sculpture, or --no-render to export only.
"""
import sys
sys.dont_write_bytecode = True
import importlib.util
import math
import random
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('orc_mesh_tools', ROOT/'scripts/build-orc-blender.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
OUT = ROOT/'local-artifacts/orc-replacement'
OUT.mkdir(parents=True, exist_ok=True)
E, L, T, M, U = g.ellipsoid, g.loft, g.tube, g.mesh, g.union


def sculpt_body():
    pieces = [L('Torso foundation', [(1.11,.29,.19,0,-.02),(1.31,.35,.22,0,-.015),
        (1.52,.37,.225,0,-.02),(1.74,.48,.235,0,-.025),(1.94,.54,.22,0,-.035),
        (2.07,.44,.18,0,-.035),(2.19,.25,.15,0,-.04),(2.30,.16,.13,0,-.035)])]
    for s in (-1,1):
        pieces += [E('Pectoral',(s*.245,1.93,.132),(.305,.183,.13),rotation=s*.17,power=2.05),
            E('Trapezius',(s*.23,2.10,-.065),(.29,.13,.18),rotation=-s*.38),
            E('Latissimus',(s*.31,1.80,-.16),(.19,.27,.13),rotation=s*.18),
            E('Scapula',(s*.23,1.96,-.18),(.23,.20,.09)),
            E('Oblique',(s*.29,1.51,.075),(.11,.23,.16),rotation=-s*.16)]
        for y,w in [(1.43,.13),(1.57,.145),(1.71,.155)]:
            pieces.append(E('Abdominal',(s*(w-.025),y,.187),(w,.090,.048),rotation=s*.16,power=2.15))
    return U(pieces,'Sculpt / connected chest abdomen back and neck',.0045)


def subtract(obj, cutter):
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Carved anatomy','BOOLEAN')
    mod.operation='DIFFERENCE'
    mod.solver='EXACT'
    mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    g.MODELS.remove(cutter)
    bpy.data.objects.remove(cutter,do_unlink=True)


def sculpt_head():
    pieces=[L('Cranium planes',[(2.13,.15,.12,0,.015),(2.18,.235,.16,0,.035),
        (2.29,.255,.175,0,.015),(2.42,.255,.205,0,-.015),
        (2.54,.239,.228,0,-.035),(2.61,.222,.214,0,-.035),
        (2.67,.19,.16,0,-.035),(2.72,.10,.10,0,-.04)],
        sides=40,steps=40),
        E('Lower jaw',(0,2.212,.126),(.226,.091,.103),power=2.5),
        E('Upper muzzle',(0,2.315,.183),(.173,.076,.081),power=2.6),
        L('Nasal bridge',[(2.37,.06,.05,0,.18),(2.42,.055,.06,0,.20),
            (2.49,.043,.055,0,.17),(2.53,.038,.04,0,.155)],sides=24,steps=18),
        E('Nose bulb',(0,2.395,.254),(.067,.055,.059),power=2.3)]
    for s in (-1,1):
        pieces += [L('Zygomatic cheek planes',[(2.255,.045,.067,s*.177,.119),
            (2.31,.062,.086,s*.184,.128),(2.40,.084,.093,s*.18,.128),
            (2.448,.062,.070,s*.179,.12)],sides=28,steps=22),
            E('Nostril wing',(s*.055,2.389,.251),(.036,.028,.035)),
            E('Chin lobe',(s*.078,2.205,.207),(.138,.056,.057),rotation=s*.15,power=2.4),
            E('Lower lip',(s*.066,2.248,.238),(.108,.044,.039),rotation=-s*.1)]
    head=U(pieces,'Sculpt / skull jaw muzzle nose and brows',.0025)
    for s in (-1,1):
        subtract(head,E('Eye socket cutter',(s*.119,2.481,.222),(.084,.049,.067),rotation=s*.12,sides=24,rings=16))
    brows=[head]
    for s in (-1,1):
        brows.append(E('Angry supraorbital ridge',(s*.111,2.515,.209),(.128,.046,.065),rotation=s*.27,power=2.4))
    head=U(brows,'Sculpt / skull jaw muzzle nose and angry brow',.0025)
    mouth=[(-.17,2.261,.270),(-.115,2.282,.269),(-.045,2.292,.27),
        (0,2.283,.277),(.045,2.292,.27),(.115,2.282,.269),(.17,2.261,.270)]
    subtract(head,T('Mouth / carved aperture',mouth,.011,sides=8,steps=26,flatten=1.5))
    for s in (-1,1):
        # Spherical eyeballs are nested in carved sockets; upper lids are part of the brow.
        E('Eye / socket shadow',(s*.12,2.480,.187),(.079,.043,.038),surface='dark',color='#232619',sides=24,rings=14)
        E('Eye / amber iris',(s*.121,2.474,.218),(.036,.034,.011),surface='eye',color='#ffbe38',sides=24,rings=12)
        E('Eye / vertical pupil',(s*.121,2.476,.228),(.012,.026,.005),surface='dark',color='#15170e',sides=16,rings=10)
        E('Eye / catch light',(s*.121-.009,2.486,.233),(.006,.006,.002),surface='ivory',color='#fff3c7',sides=8,rings=6)
        T('Lower eyelid',[(s*.047,2.475,.22),(s*.09,2.437,.217),(s*.147,2.437,.214),(s*.186,2.478,.195)],
            .006,surface='skin',color='#71803d',sides=8,steps=12)
        E('Nostril',(s*.047,2.375,.283),(.020,.009,.009),surface='dark',color='#32391d',rotation=s*.16,sides=12,rings=8)
        T('Mandibular tusk',[(s*.173,2.24,.252),(s*.192,2.279,.285),(s*.195,2.335,.293),(s*.176,2.395,.28)],
            lambda t:.035*(1-t)**.68+.0015,surface='ivory',color='#e3d0a0',sides=12,steps=15)
        T('Cheek crease',[(s*.205,2.389,.211),(s*.204,2.352,.214),(s*.22,2.31,.192)],
            .0025,surface='skin',color='#535c31',sides=5,steps=9)
        # The ear is a solid cupped leaf with a raised helix and a recessed concha.
        outline=[(s*.217,2.50,.015),(s*.285,2.535,.001),(s*.423,2.552,-.012),
                 (s*.367,2.469,.012),(s*.285,2.399,.038),(s*.237,2.408,.066)]
        g.plate('Ear / cupped cartilage',outline,(s*.291,2.47,-.012),'body','skin','#82904a',.035,5)
        inner=[(s*.255,2.491,.029),(s*.291,2.503,.018),(s*.377,2.529,.006),
               (s*.331,2.474,.025),(s*.283,2.432,.034)]
        g.plate('Ear / recessed inner plane',inner,(s*.292,2.470,.008),'body','skin','#515b2d',.004,3)
        T('Ear / folded antihelix',[(s*.264,2.419,.067),(s*.293,2.45,.049),(s*.295,2.481,.034),(s*.345,2.51,.022)],
            .011,surface='skin',color='#87924c',sides=7,steps=12)
    T('Mouth / recessed frown', [(x,y,z-.013) for x,y,z in mouth],
        .006,surface='dark',color='#302d1b',sides=7,steps=26)
    for x in (-.12,.12):
        T('Small lower canine',[(x,2.268,.281),(x*.96,2.294,.279)],.014,tip=.001,surface='ivory',sides=9,steps=5)
    # Asymmetric healed scar on the right cheek.
    for offset in (0,.02):
        T('Cheek / scar',[(.166+offset,2.444,.22),(.182+offset,2.414,.224),(.187+offset,2.377,.225)],
            .0025,surface='skin',color='#a2784b',sides=5,steps=10)
    return head


def sculpt_arm(s):
    bone='leftArm' if s<0 else 'rightArm'
    pieces=[E('Deltoid',(s*.59,1.991,-.006),(.23,.235,.20),bone,rotation=-s*.25),
        E('Upper arm',(s*.715,1.79,-.005),(.195,.275,.168),bone,rotation=-s*.35),
        E('Biceps',(s*.714,1.796,.095),(.157,.211,.126),bone,rotation=-s*.35),
        E('Triceps',(s*.715,1.785,-.095),(.167,.237,.119),bone,rotation=-s*.27),
        E('Elbow',(s*.79,1.571,-.013),(.147,.135,.142),bone),
        E('Forearm',(s*.829,1.414,.028),(.162,.245,.154),bone,rotation=-s*.12),
        E('Brachioradialis',(s*.871,1.47,.079),(.107,.201,.105),bone,rotation=-s*.12),
        E('Wrist',(s*.859,1.187,.051),(.117,.14,.12),bone),
        E('Palm',(s*.863,1.062,.054),(.153,.147,.126),bone,rotation=s*.12,power=2.7)]
    # Four curled fingers run around the palm, not a row of separate dangling spheres.
    for j in range(4):
        x=s*(.760+j*.063)
        y=1.029-.029*math.sin(j/3*math.pi)
        pieces += [E('Metacarpal',(x,y+.045,.145),(.045,.079,.057),bone,rotation=s*.13,power=2.5),
            E('Curled proximal finger',(x,y-.017,.114),(.046,.065,.066),bone,rotation=s*.16,power=2.7),
            E('Curled distal finger',(x,y-.018,.032),(.043,.048,.046),bone,power=2.5)]
    pieces += [E('Thumb base',(s*.748,1.098,.091),(.063,.094,.070),bone,rotation=-s*.36),
        E('Thumb knuckle',(s*.758,1.037,.17),(.061,.066,.054),bone,rotation=s*.5,power=2.6)]
    arm=U(pieces,bone+' / shoulder upper arm forearm and clenched hand',.0035)
    for j in range(3):
        x=s*(.790+j*.063)
        groove=[]
        for y in (1.04,1.026,1.011,.996,.981):
            hit,loc,_,_=arm.ray_cast(g.world((x,y,1)),g.world((0,0,-1)))
            if hit:
                p=g.game(loc);p.z+=.0015;groove.append(tuple(p))
        if len(groove)>2:
            subtract(arm,T('Carved finger fold',groove,.0045,bone,sides=10,steps=20))
    # Subtle skin creases, flush with the finger surface.
    for j in range(3):
        x=s*(.790+j*.063)
        T('Hand / finger separation',[(x,1.030,.188),(x,1.002,.169),(x, .974,.132)],
            .0023,bone,'skin','#536033',sides=5,steps=8)
    return arm


def sculpt_leg(s):
    bone='leftLeg' if s<0 else 'rightLeg'
    pieces=[E('Hip',(s*.255,1.11,-.023),(.22,.185,.20),bone),
        E('Thigh',(s*.335,.983,.014),(.219,.274,.207),bone,rotation=-s*.23),
        E('Vastus medialis',(s*.324,.84,.13),(.123,.154,.117),bone,rotation=s*.25),
        E('Outer quadriceps',(s*.403,.958,.09),(.146,.218,.147),bone,rotation=-s*.16),
        E('Knee',(s*.4,.719,.048),(.139,.131,.143),bone),
        E('Calf',(s*.425,.51,-.038),(.139,.229,.155),bone),
        E('Ankle',(s*.435,.255,-.005),(.11,.18,.112),bone)]
    return U(pieces,bone+' / hip quadriceps knee and calf',.0045)


def hair():
    # Hairline follows the forehead. Swept locks converge on the tied crown.
    scalp=[E('Hair / scalp mass',(.009,2.698,-.038),(.196,.076,.157),surface='dark',color='#262421')]
    for v in scalp[0].data.vertices:
        p=g.game(v.co)
        sweep=math.sin((p.x+.20)*9+(p.y-2.70)*6)
        p.y+=.008*sweep*max(0,min(1,(p.z+.01)/.12))
        p.z+=.0025*math.cos(p.x*145+(p.y-2.69)*95)
        v.co=g.world(p)
    scalp[0].data.update()
    scalp_obj=U(scalp,'Hair / sculpted swept hairline',.0025)
    E('Hair / gathered crown',(0,2.77,-.087),(.092,.065,.081),surface='dark',color='#282522',sides=16,rings=10)
    g.band('Hair / leather tie',2.79,.086,.065,0,-.085,.038,'body',color='#9a6939')
    crest=[E('Hair / crest core',(-.015,2.853,-.069),(.080,.072,.060),surface='dark',color='#302b27',sides=20,rings=12)]
    for j in range(5):
        x=(j-2)*.030
        crest.append(T('Hair / swept topknot',[(x,2.80,-.083),(x*1.3,2.882,-.095),
            (x*.8-.012,2.936,-.035),(x*.3-.07,2.918,.055),(x*.2-.125,2.875,.086)],
            lambda t:.043*(1-.88*t)+.003,surface='dark',color='#302b27',sides=8,steps=15,flatten=.75))
    crest_obj=U(crest,'Hair / sculpted hooked topknot',.0025)
    for obj,starts,end_y in [(scalp_obj,[(j*.035,2.67+.009*abs(j)) for j in range(-4,5)],2.755),
                             (crest_obj,[(j*.025,2.813) for j in range(-2,3)],2.921)]:
        for x0,y0 in starts:
            line=[]
            for j in range(7):
                t=j/6;x=x0*(1-.4*t)-.016*t;y=y0+(end_y-y0)*t
                hit,loc,_,_=obj.ray_cast(g.world((x,y,1)),g.world((0,0,-1)))
                if hit:
                    p=g.game(loc);p.z+=.0005;line.append(tuple(p))
            if len(line)>2:
                T('Hair / fine swept strand',line,.0012,surface='dark',color='#51473b',sides=4,steps=6)
    for j in (-1,0,1):
        T('Hair / tied nape tail',[(j*.025,2.75,-.12),(j*.044,2.642,-.223),
            (j*.037,2.527,-.235),(j*.012,2.45,-.211)],
            lambda t:.047*(1-t)**.6+.002,surface='dark',color='#252520',sides=8,steps=12,flatten=.65)


def fitted_point(obj,x,y,z,cx,cz,offset=.009):
    radial=Vector((x-cx,0,z-cz)).normalized()
    origin=Vector((cx,y,cz))+radial
    candidates=[]
    for target in obj if isinstance(obj,list) else [obj]:
        hit,loc,_,_=target.ray_cast(g.world(origin),g.world(-radial))
        if hit:candidates.append(g.game(loc))
    if candidates:
        p=min(candidates,key=lambda p:(p-origin).length)+radial*offset
        return tuple(p)
    return (x,y,z)


def armor(arms):
    for s in (-1,1):
        bone='leftArm' if s<0 else 'rightArm'
        cx=s*.60
        g.dome('Pauldron / hammered shell',cx,2.015,.34 if s<0 else .245,.245,.23 if s<0 else .215,bone,'#45454c')
        if s<0:
            outline=[(-.927,2.015,.07),(-.89,2.14,.154),(-.665,2.208,.2),(-.425,2.12,.17),
                (-.442,1.945,.228),(-.592,1.878,.259),(-.772,1.933,.219)]
            outline=[(-.64+(x+.64)*1.14,2.06+(y-2.06)*1.16,z) for x,y,z in outline]
            g.plate('Pauldron / angular front shield',outline,(-.664,2.065,.263),bone,color='#42434b',rings=5)
            g.rim('Pauldron / worn forged lip',outline,bone,radius=.009,color='#998b72')
            g.plate('Pauldron / lower overlapping lame',[(-.927,1.972,.012),(-.906,2.047,.144),
                (-.795,2.03,.233),(-.689,1.938,.254),(-.778,1.866,.21),(-.957,1.929,.073)],
                (-.844,1.978,.235),bone,color='#393c44',rings=3)
            for i,(x,y,z,h) in enumerate([(-.842,2.17,.034,.21),(-.716,2.198,.091,.225),(-.55,2.195,.065,.30),(-.474,2.033,.237,.145)]):
                x=-.64+(x+.64)*1.10
                y+=.028 if i<3 else 0
                T('Pauldron / ivory spike '+str(i+1),[(x,y,z),(x-.018,y+h*.50,z+.015),(x-.06,y+h,z+.02)],
                    lambda t:(.054 if i<3 else .029)*(1-t)**.74+.0015,bone,'ivory','#ddcda7',sides=10,steps=10)
            for p in [(-.57,1.946,.263),(-.704,1.978,.270),(-.46,2.088,.206)]:g.stud('Pauldron / rivet',p,bone,r=.018)
        else:
            outline=[(.377,2.045,.123),(.413,2.179,.065),(.583,2.191,.168),(.771,2.10,.183),(.85,1.982,.10),(.65,1.972,.256),(.443,2.008,.23)]
            g.plate('Pauldron / small convex face',outline,(.606,2.097,.266),bone,color='#45464e',rings=4)
            g.rim('Pauldron / small forged lip',outline,bone,radius=.007,color='#867d6e')
            g.stud('Pauldron / attachment',(.431,2.067,.236),bone,r=.014)
        # Open-ended shaped leather sleeve, fitted to the tapered forearm.
        rows=[(1.16,.132,.128,s*.856,.045),(1.20,.138,.131,s*.853,.044),
              (1.34,.151,.151,s*.842,.033),(1.49,.173,.16,s*.817,.024)]
        def fit(x,y,z,a):
            _,_,cxx,czz=g.interpolate(rows,y)
            return fitted_point(arms[s],x,y+.025*math.sin(a),z,cxx,czz,.013)
        cuff=L('Bracer / fitted leather',rows,bone,'leather','#63422d',sides=36,steps=18,sculpt=fit)
        for y,rx,rz,cxx,czz in (rows[0],rows[-1]):
            pts=[fit(cxx+math.sin(a)*rx,y,czz+math.cos(a)*rz,a) for a in [j*math.tau/28 for j in range(29)]]
            T('Bracer / bound rim',pts,.011,bone,'leather','#957048',sides=6,steps=30)
        seam=[]
        for j in range(9):
            y=1.18+j*.035
            rx,rz,cxx,czz=g.interpolate(rows,y)
            seam.append(fitted_point(arms[s],cxx+s*rx*.58,y+.025*s*.58,czz+rz*.83,cxx,czz,.020))
        T('Bracer / overlapped seam',seam,.008,bone,'leather','#3e2a1f',sides=5,steps=12)
        for j in (0,3,7):
            p=seam[j]
            g.stud('Bracer / fastening',p,bone,r=.011)
        for j in range(6):
            x,y,z=seam[j+1]
            T('Bracer / stitch',[(x-.011,y-.004,z+.007),(x+.011,y+.004,z+.007)],.002,bone,'leather','#b08a57',sides=4,steps=1)


def clothes(torso,legs,arms):
    # Strap follows the new chest surface continuously.
    def strap(back=False):
        vertices=[]
        for j in range(37):
            t=j/36
            x=-.413+.748*t
            y=2.133-.802*t
            for k in range(7):
                side=-1+k/3
                xx=x+side*.046
                yy=y+side*.043
                hits=[]
                for skin in [torso,*arms.values()]:
                    hit,loc,_,_=skin.ray_cast(g.world((xx,yy,-2 if back else 2)),g.world((0,0,1 if back else -1)))
                    if hit:hits.append(g.game(loc).z)
                z=(min(hits) if back else max(hits)) if hits else (-.2 if back else .2)
                z+=-.019 if back else .019
                vertices.append((xx,yy,z))
        faces=[(7*j+k,7*j+k+1,7*(j+1)+k+1,7*(j+1)+k) for j in range(36) for k in range(6)]
        obj=M('Harness / back' if back else 'Harness / diagonal chest strap',vertices,faces,surface='leather',color='#593727')
        for side in (0,6):
            T('Harness / sewn edge',[vertices[7*j+side] for j in range(37)],.0035,surface='leather',color='#92704c',sides=5,steps=34)
        return obj
    strap()
    strap(True)
    for x,y in [(-.279,1.98),(-.062,1.748)]:
        z=g.surface_depth(torso,x,y)+.035
        g.rectangle_frame('Harness / square brass buckle',x,y,z,.102,.113,angle=-.75,color='#ba965b')
    for t in (.40,.49,.58,.67,.76):
        x,y=-.413+.748*t,2.133-.802*t
        E('Harness / punched hole',(x,y,g.surface_depth(torso,x,y)+.025),(.006,.006,.003),surface='dark',color='#282218',sides=8,rings=5)
    belt=L('Belt / broad waist',[(1.231,.394,.268,0,-.005),(1.383,.394,.268,0,-.005)],
        surface='leather',color='#523524',sides=40,steps=5,
        sculpt=lambda x,y,z,a:fitted_point([torso,*legs.values()],x,y,z,0,-.005,.017))
    for y in (1.239,1.375):
        T('Belt / welt',[fitted_point([torso,*legs.values()],math.sin(a)*.393,y,-.005+math.cos(a)*.263,0,-.005,.023) for a in [j*math.tau/40 for j in range(41)]],
            .006,surface='leather',color='#8b6949',sides=5,steps=42)
    g.rectangle_frame('Belt / square buckle',0,1.303,.284,.218,.205,color='#c29b58')
    for x in (-.28,-.17,.17,.28):
        g.stud('Belt / rivet',(x,1.306,.258*math.sqrt(1-(x/.394)**2)+.008),'body',r=.013)
    # Separate layered tassets with open thigh gaps, never a cylindrical skirt.
    for s in (-1,1):
        for back in (False,True):
            zsign=-1 if back else 1
            outline=[(s*.235,1.243,zsign*.20),(s*.378,1.217,zsign*.12),(s*.505,.988,zsign*.122),
                (s*.444,.955,zsign*.206),(s*.311,1.061,zsign*.244)]
            g.plate('Tasset / outer hanging leather',outline,(s*.374,1.125,zsign*.243),'body','leather','#553624',.012,4)
            g.rim('Tasset / stitched perimeter',outline,'body','leather','#8b6948',radius=.004)
            flap=[(s*.20,1.252,zsign*.215),(s*.365,1.242,zsign*.158),(s*.416,1.15,zsign*.205),(s*.293,1.13,zsign*.263)]
            g.plate('Tasset / upper overlap',flap,(s*.303,1.206,zsign*.254),'body','leather','#684731',.014,3)
        outline=[(s*.012,1.242,.270),(s*.214,1.227,.258),(s*.245,.927,.261),(s*.116,.868,.286),(s*.017,.912,.287)]
        g.plate('Apron / side panel',outline,(s*.119,1.066,.29),'body','leather','#62412d',.012,5)
        g.rim('Apron / side binding',outline,'body','leather','#8c6842',radius=.004)
    outline=[(-.10,1.24,.292),(.10,1.24,.292),(.11,.851,.301),(.04,.837,.307),(-.102,.857,.298)]
    g.plate('Apron / long central tongue',outline,(0,1.048,.315),'body','leather','#4c3023',.013,6)
    g.rim('Apron / tongue binding',outline,'body','leather','#977247',radius=.004)
    back=[(-.24,1.24,-.235),(.24,1.24,-.235),(.27,.927,-.247),(0,.863,-.271),(-.255,.942,-.25)]
    g.plate('Apron / rear panel',back,(0,1.08,-.27),'body','leather','#5c3c2b',.014,5)


def boots():
    for s in (-1,1):
        bone='leftLeg' if s<0 else 'rightLeg'
        cx=s*.421
        L('Boot / leather shaft',[(.17,.137,.155,cx,-.007),(.30,.137,.145,cx,-.014),
            (.47,.159,.18,cx,-.021),(.60,.181,.184,cx,-.005)],bone,'leather','#4c3023',sides=24,steps=12)
        # A single shaped shoe profile includes the broad toe; the cap is a shell on it.
        shoe=[(.028,.207,.294,cx,.104),(.07,.212,.30,cx,.102),(.16,.196,.286,cx,.095),
              (.237,.154,.219,cx,.050),(.285,.123,.154,cx,.003)]
        L('Boot / foot',shoe,bone,'leather','#48352a',sides=32,steps=14)
        L('Boot / layered sole',[(.015,.21,.298,cx,.104),(.04,.213,.302,cx,.104),(.065,.21,.298,cx,.104)],bone,'leather','#272722',sides=28,steps=3)
        verts=[]
        for row in range(10):
            y=.065+row/9*.169
            rx,rz,xx,zz=g.interpolate(shoe,y)
            for j in range(19):
                a=-1.24+j/18*2.48
                verts.append((xx+math.sin(a)*(rx+.003),y,zz+math.cos(a)*(rz+.004)))
        faces=[(r*19+j,r*19+j+1,(r+1)*19+j+1,(r+1)*19+j) for r in range(9) for j in range(18)]
        M('Boot / shaped iron toe cap',verts,faces,bone,'iron','#42444c')
        T('Boot / toe cap welt',[verts[j] for j in range(19)],.008,bone,'iron','#857a65',sides=6,steps=22)
        for y,h,tilt in [(.55,.078,-s*.034),(.366,.065,s*.026),(.254,.055,-s*.022)]:
            g.band('Boot / leather fastening strap',y,.175 if y>.4 else .149,.184 if y>.4 else .174,cx,0,h,bone,color='#795238',tilt=tilt)
        g.stud('Boot / strap rivet',(cx+s*.102,.34,.144),bone,r=.013)
        outline=[(cx-.125,.79,.117),(cx-.063,.823,.171),(cx+.10,.80,.147),(cx+.142,.678,.157),
            (cx+.075,.609,.20),(cx-.041,.593,.214),(cx-.132,.65,.17)]
        outline=[(cx+(x-cx)*1.12,.714+(y-.714)*1.15,z) for x,y,z in outline]
        g.plate('Knee / convex iron guard',outline,(cx,.711,.255),bone,color='#3a3b42',rings=5)
        g.rim('Knee / worn forged lip',outline,bone,radius=.007,color='#8d8069')


def clean_quantized_degenerates():
    # Weld only sub-export-resolution vertices, then remove zero-area polygons.
    import bmesh
    for obj in g.MODELS:
        # Quantize before topology cleanup so tiny Boolean slivers cannot collapse
        # into zero-area triangles only after the game's Int16 conversion.
        for vertex in obj.data.vertices:
            vertex.co=Vector(tuple(round(c,4) for c in vertex.co))
        bm=bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00016)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00008)
        bm.to_mesh(obj.data); bm.free(); obj.data.update()


def finish_pose():
    for obj in g.MODELS:
        bone=obj['creature_bone']
        s=-1 if bone.startswith('left') else 1
        for v in obj.data.vertices:
            p=g.game(v.co)
            if bone.endswith('Arm') and p.y<1.19:
                w=min(1,max(0,(1.19-p.y)/.12))
                p.x=s*.86+(p.x-s*.86)*(1+.17*w)+s*.015*w
                p.z=.06+(p.z-.06)*(1+.17*w)
            elif bone.endswith('Leg'):
                theta=s*.27*min(1,max(0,(.85-p.y)/.65))
                dx=p.x-s*.435
                p.x=s*.435+dx*math.cos(theta)+p.z*math.sin(theta)
                p.z=-dx*math.sin(theta)+p.z*math.cos(theta)
            v.co=g.world(p)
        obj.data.update()


def fingernails(arms):
    for s,arm in arms.items():
        bone='leftArm' if s<0 else 'rightArm'
        outline=[]
        cx=s*.752
        for dx,dy in [(-.016,-.012),(.012,-.014),(.020,-.005),(.017,.010),
                      (.010,.016),(-.013,.015),(-.021,.006),(-.021,-.005)]:
            x,y=cx+dx,1.057+dy
            hit,loc,_,_=arm.ray_cast(g.world((x,y,1)),g.world((0,0,-1)))
            if hit:
                p=g.game(loc);p.z+=.0015;outline.append(tuple(p))
        if len(outline)==8:
            center=tuple(sum(p[i] for p in outline)/8+( .001 if i==2 else 0) for i in range(3))
            g.plate('Hand / thumbnail',outline,center,bone,'skin','#8c9156',thickness=.001,rings=1)


def wear_details():
    rng=random.Random(1702)
    selected=('Pauldron / angular','Pauldron / small convex','Knee / convex',
        'Boot / shaped iron','Bracer / fitted','Apron / long','Apron / side')
    for obj in list(g.MODELS):
        if not obj.name.startswith(selected):continue
        points=[g.game(v.co) for v in obj.data.vertices]
        lo=[min(p[i] for p in points) for i in range(3)]
        hi=[max(p[i] for p in points) for i in range(3)]
        count=0
        for attempt in range(45):
            if count>=5:break
            x=rng.uniform(lo[0]+.02,hi[0]-.02)
            y=rng.uniform(lo[1]+.015,hi[1]-.015)
            dx=rng.uniform(.008,.030);dy=rng.uniform(-.019,.022)
            stroke=[]
            for t in (0,.4,1):
                xx=x+dx*t; yy=y+dy*t+(.002 if t==.4 else 0)
                hit,loc,n,_=obj.ray_cast(g.world((xx,yy,2)),g.world((0,0,-1)))
                if not hit or g.game(n).z<.25:break
                p=g.game(loc); p.z+=.0016;stroke.append(tuple(p))
            if len(stroke)!=3:continue
            T('Wear / incised scuff',stroke,.0011,obj['creature_bone'],obj['creature_surface'],
                '#aa9780' if obj['creature_surface']=='iron' else '#a57a49',sides=4,steps=3)
            count+=1


def finish_paint():
    for obj in g.MODELS:
        attr=obj.data.color_attributes['Paint']
        surface=obj['creature_surface']
        if surface=='ivory':
            ys=[g.game(v.co).y for v in obj.data.vertices]
            lo,hi=min(ys),max(ys)
            for v in obj.data.vertices:
                t=(g.game(v.co).y-lo)/max(.001,hi-lo)
                root=g.rgb('#aa8752');tip=g.rgb('#eee1bf')
                c=tuple(a+(b-a)*(.20+.80*t**.48) for a,b in zip(root,tip))
                attr.data[v.index].color=(*c,1)
        elif obj.name.startswith(('Wear /','Hair / fine','Hand / thumbnail')):
            for d in attr.data:d.color=(*g.rgb(obj['paint_color']),1)
        elif surface in ('iron','leather'):
            # Reference highlights should not become large white camouflage patches.
            base=g.rgb(obj['paint_color'])
            for d in attr.data:
                d.color=(*(a*.32+b*.68 for a,b in zip(d.color[:3],base)),1)


def painted_skin_planes():
    """Broad contiguous pigment planes, sampled from the sculpt's own normals."""
    from mathutils.kdtree import KDTree
    for obj in g.MODELS:
        if not obj.name.startswith(('Sculpt /','leftArm /','rightArm /','leftLeg /','rightLeg /')):
            continue
        spacing=.060 if 'skull' in obj.name else .105
        cells={}
        for v in obj.data.vertices:
            p=g.game(v.co)
            cell=tuple(math.floor(c/spacing) for c in p)
            if cell not in cells:
                cells[cell]=(p.copy(),g.game(v.normal).copy())
        seeds=list(cells.values())
        tree=KDTree(len(seeds))
        for i,(p,n) in enumerate(seeds):tree.insert(p,i)
        tree.balance()
        attr=obj.data.color_attributes['Paint']
        for v in obj.data.vertices:
            p=g.game(v.co)
            _,i,_=tree.find(p)
            seed,n=seeds[i]
            variation=.96+.11*max(0,n.y*.7+n.z*.3-n.x*.25)
            variation+=.035*math.sin(seed.x*43+seed.y*37+seed.z*29)
            attr.data[v.index].color=(*(min(1,c*variation) for c in attr.data[v.index].color[:3]),1)


def crafted_edges():
    """Model broad forged bevels and individually spaced leather stitches."""
    for obj in list(g.MODELS):
        if not obj.name.startswith(('Pauldron / angular','Pauldron / small convex','Knee / convex')):
            continue
        n=7
        front_count=len(obj.data.vertices)//2
        outline=[g.game(v.co) for v in obj.data.vertices[front_count-n:front_count]]
        center=sum(outline,Vector((0,0,0)))/n
        sign=-1 if center.z<0 else 1
        vertices=[]
        for inset,lift in [(0,0),(.012,.006),(.023,.002)]:
            for p in outline:
                delta=center-p
                delta.z=0
                q=p+delta.normalized()*inset
                hit,loc,_,_=obj.ray_cast(g.world((q.x,q.y,sign*2)),g.world((0,0,-sign)))
                if hit:q.z=g.game(loc).z
                q.z+=sign*(lift+.002)
                vertices.append(tuple(q))
        faces=[(row*n+j,row*n+(j+1)%n,(row+1)*n+(j+1)%n,(row+1)*n+j)
               for row in range(2) for j in range(n)]
        g.mesh('Forged bevel / '+obj.name,vertices,faces,obj['creature_bone'],'iron','#998771',smooth=False)
    for obj in list(g.MODELS):
        if not obj.name.startswith(('Apron / long central','Apron / side panel','Tasset / outer')):
            continue
        n=5
        front_count=len(obj.data.vertices)//2
        outline=[g.game(v.co) for v in obj.data.vertices[front_count-n:front_count]]
        center=sum(outline,Vector((0,0,0)))/n
        sign=-1 if center.z<0 else 1
        for a,b in zip(outline,outline[1:]+outline[:1]):
            length=(b-a).length
            count=max(1,int(length/.030))
            for j in range(1,count):
                p=a.lerp(b,j/count)
                p+=((center-p).normalized()*.011)
                hit,loc,_,_=obj.ray_cast(g.world((p.x,p.y,sign*2)),g.world((0,0,-sign)))
                if not hit:continue
                p.z=g.game(loc).z+sign*.0025
                tangent=(b-a).normalized()*.004
                T('Leather / inset saddle stitch',[tuple(p-tangent),tuple(p+tangent)],.0018,
                  obj['creature_bone'],'leather','#ae8658',sides=6,steps=2)


def finish_art_palette():
    # High-resolution geometry must not reproduce the small reference crop's
    # pixel boundaries. Retain a restrained amount of its pigment and occlusion.
    for obj in list(g.MODELS):
        name=obj.name
        if obj.get('art_palette_v1'):continue
        if name in ('Pauldron / worn forged lip','Pauldron / rear forged lip','Pauldron / small forged lip') or name.startswith('Knee / worn forged lip'):
            g.MODELS.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
            continue
        if name.startswith(('Pauldron / angular','Pauldron / small convex','Knee / convex')):
            for face in obj.data.polygons:face.use_smooth=True
        attr=obj.data.color_attributes.get('Paint')
        if attr is None:continue
        if name.startswith(('Sculpt /','leftArm /','rightArm /','leftLeg /','rightLeg /')):
            base=g.rgb('#819248')
            for d in attr.data:
                d.color=(*(a*.24+b*.76 for a,b in zip(d.color[:3],base)),1)
        elif name.startswith('Hair /') and 'fine' not in name and 'tie' not in name:
            base=g.rgb('#292723')
            for d in attr.data:d.color=(*base,1)
        elif name.startswith('Forged bevel /'):
            base=g.rgb('#6e6250')
            for d in attr.data:d.color=(*base,1)
        obj['art_palette_v1']=True


def render_views(args):
    scene=bpy.context.scene;camera=scene.camera
    only=args[args.index('--view')+1] if '--view' in args else None
    for name,loc,target,scale in [('front',(0,1.5,9),(0,1.5,0),3.15),
        ('face',(.65,2.54,8),(0,2.54,0),.87),('quarter',(3.2,2.45,8),(0,1.5,0),3.15),
        ('rear',(0,1.5,-9),(0,1.5,0),3.15)]:
        if only and only!=name:continue
        g.set_camera(camera,loc,target);camera.data.ortho_scale=scale
        scene.render.filepath=str(OUT/(name+'.png'))
        bpy.ops.render.render(write_still=True)


def main():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if '--anatomy' in args and '--publish' in args:
        raise ValueError('Anatomy inspection is staged only; omit --publish.')
    if '--publish' not in args:
        g.SOURCE=OUT/'orc.blend';g.GLB=OUT/'orc.glb';g.DATA=OUT/'orc-blender-data.json'
    if '--render-only' in args:
        bpy.ops.wm.open_mainfile(filepath=str(g.SOURCE));render_views(args);return
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    print('SCULPT_STAGE torso',flush=True)
    torso=sculpt_body()
    head_start=len(g.MODELS)
    print('SCULPT_STAGE head and hair',flush=True)
    sculpt_head();hair()
    for obj in g.MODELS[head_start:]:
        for v in obj.data.vertices:v.co.z+=.05
        obj.data.update()
    arms={};legs={}
    print('SCULPT_STAGE limbs and carved hands',flush=True)
    for s in (-1,1):arms[s]=sculpt_arm(s);legs[s]=sculpt_leg(s)
    if '--anatomy' not in args:
        print('SCULPT_STAGE fitted equipment',flush=True)
        armor(arms); clothes(torso,legs,arms); boots(); wear_details()
    finish_pose();fingernails(arms)
    refine_spec=importlib.util.spec_from_file_location('orc_concept_refinement',ROOT/'scripts/refine-orc-concept.py')
    refinement=importlib.util.module_from_spec(refine_spec);refine_spec.loader.exec_module(refinement)
    refinement.refine(g.MODELS,g.game,g.world)
    refinement.fit_hair_strands(g.MODELS,g.game,g.world)
    refinement.armor_planes(g.MODELS,g.game,g.world)
    if '--anatomy' not in args:refinement.armor_clearance(g.MODELS,g.game,g.world)
    if '--anatomy' not in args:crafted_edges()
    clean_quantized_degenerates()
    print('NEW_SCULPT_COMPLETE',len(g.MODELS),flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'unpainted-sculpt.blend'),compress=True)
    g.paint_models()
    finish_paint()
    painted_skin_planes()
    finish_art_palette()
    g.create_rig()
    camera=g.setup_studio()
    scene=bpy.context.scene
    scene['art_reference']='HEXFALL concept: fresh sculpture, no prior asset meshes'
    scene.render.resolution_x=680; scene.render.resolution_y=880; scene.cycles.samples=24
    if '--anatomy' not in args:g.export_batches()
    bpy.ops.wm.save_as_mainfile(filepath=str(g.SOURCE),compress=True)
    if '--no-render' not in args:render_views(args)
    print('NEW_ORC_DONE',flush=True)


if __name__=='__main__':main()
