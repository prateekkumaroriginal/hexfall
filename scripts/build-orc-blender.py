"""Build the editable orc, render inspection views, and export the game's shared batches.

Run with Blender --background --factory-startup --python scripts/build-orc-blender.py.
To export hand edits: blender assets/enemies/orc.blend --background --python this.py -- --export-only.
Authoring coordinates are X right, Y up, Z forward, matching the game.
"""
import argparse
import base64
import json
import math
import os
import random
import struct
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/enemies/orc.blend'
GLB = ROOT / 'public/models/orc.glb'
DATA = ROOT / 'src/game/orc-blender-data.json'
RENDERS = ROOT / 'local-artifacts/blender-orc'
PIVOTS = {'body': (0, 0, 0), 'leftArm': (-.66, 2.04, 0), 'rightArm': (.66, 2.04, 0),
          'leftLeg': (-.33, 1.18, 0), 'rightLeg': (.33, 1.18, 0)}
PALETTE = {'skin': '#78844e', 'iron': '#454752', 'leather': '#493127',
           'ivory': '#decea7', 'dark': '#24271d', 'eye': '#efb844'}
MODELS = []


def linear(c):
    return c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4


def rgb(h):
    return tuple(linear(int(h[i:i+2], 16) / 255) for i in (1, 3, 5))


def world(p):
    return Vector((p[0], -p[2], p[1]))


def game(p):
    return Vector((p[0], p[2], -p[1]))


def gauss(v):
    return math.exp(-v * v)


def material(surface):
    name = 'Orc / ' + surface
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    vertex = nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Paint'
    m.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = {'skin': .78, 'iron': .43, 'leather': .8,
                                               'ivory': .48, 'dark': .8, 'eye': .3}[surface]
    shader.inputs['Metallic'].default_value = .32 if surface == 'iron' else 0
    if surface == 'iron':
        shader.inputs['Roughness'].default_value = .58
    if surface == 'eye':
        m.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = .14
    return m


def mesh(name, vertices, faces, bone='body', surface='skin', color=None, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([world(v) for v in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj['creature_bone'] = bone
    obj['creature_surface'] = surface
    obj['paint_color'] = color or PALETTE[surface]
    obj.data.materials.append(material(surface))
    for poly in data.polygons:
        poly.use_smooth = smooth
    MODELS.append(obj)
    return obj


def interpolate(rows, y):
    for a, b in zip(rows, rows[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            t = t * t * (3 - 2 * t)
            return [a[i] * (1 - t) + b[i] * t for i in range(1, len(a))]
    return rows[0][1:] if y < rows[0][0] else rows[-1][1:]


def loft(name, rows, bone='body', surface='skin', color=None, sides=40, steps=42, sculpt=None):
    verts, faces = [], []
    for r in range(steps + 1):
        y = rows[0][0] + (rows[-1][0] - rows[0][0]) * r / steps
        rx, rz, cx, cz = interpolate(rows, y)
        for j in range(sides):
            a = j / sides * math.tau
            p = (cx + math.sin(a) * rx, y, cz + math.cos(a) * rz)
            verts.append(sculpt(*p, a) if sculpt else p)
            if r < steps:
                k = r * sides + j
                n = r * sides + (j + 1) % sides
                faces.append((k, n, n + sides, k + sides))
    for r in (0, steps):
        rx, rz, cx, cz = interpolate(rows, rows[0][0] if r == 0 else rows[-1][0])
        c = len(verts)
        verts.append((cx, rows[0][0] if r == 0 else rows[-1][0], cz))
        for j in range(sides):
            faces.append((c, r * sides + j, r * sides + (j + 1) % sides))
    return mesh(name, verts, faces, bone, surface, color)


def ellipsoid(name, center, radii, bone='body', surface='skin', color=None, rotation=0, power=2,
              sides=20, rings=12):
    v, f = [], []
    for row in range(rings + 1):
        phi = math.pi * (row + .001) / (rings + .002)
        for j in range(sides):
            a = j / sides * math.tau
            def q(t):
                return math.copysign(abs(t) ** (2 / power), t)
            x = q(math.sin(phi) * math.sin(a)) * radii[0]
            y = q(math.cos(phi)) * radii[1]
            z = q(math.sin(phi) * math.cos(a)) * radii[2]
            v.append((center[0] + x * math.cos(rotation) - y * math.sin(rotation),
                      center[1] + x * math.sin(rotation) + y * math.cos(rotation), center[2] + z))
            if row < rings:
                k = row * sides + j
                n = row * sides + (j + 1) % sides
                f.append((k, n, n + sides, k + sides))
    f.append(tuple(reversed(range(sides))))
    f.append(tuple(rings * sides + j for j in range(sides)))
    return mesh(name, v, f, bone, surface, color)


def sample_curve(points, steps):
    points = [Vector(p) for p in points]
    out = []
    for k in range(steps + 1):
        t = k / steps * (len(points) - 1)
        i = min(len(points) - 2, int(t))
        u = t - i
        a, b, c, d = points[max(0, i-1)], points[i], points[i+1], points[min(len(points)-1, i+2)]
        out.append(.5 * ((2*b) + (-a+c)*u + (2*a-5*b+4*c-d)*u*u + (-a+3*b-3*c+d)*u*u*u))
    return out


def tube(name, points, radius, bone='body', surface='skin', color=None, tip=None, sides=8, steps=16,
         flatten=1):
    centers = sample_curve(points, steps)
    v, f = [], []
    for i, center in enumerate(centers):
        tangent = (centers[min(steps, i+1)] - centers[max(0, i-1)]).normalized()
        ref = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((0, 1, 0))
        n = tangent.cross(ref).normalized()
        b = tangent.cross(n).normalized()
        t = i / steps
        r = radius(t) if callable(radius) else radius * (1 - t) + (tip if tip is not None else radius) * t
        for j in range(sides):
            a = j / sides * math.tau
            v.append(center + n * math.cos(a) * r + b * math.sin(a) * r * flatten)
            if i < steps:
                k, nxt = i * sides + j, i * sides + (j + 1) % sides
                f.append((k, nxt, nxt + sides, k + sides))
    f.append(tuple(reversed(range(sides))))
    f.append(tuple(steps * sides + j for j in range(sides)))
    return mesh(name, v, f, bone, surface, color)


def union(objects, name, voxel, triangle_limit):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = objects[0]
    for o in objects[1:]:
        MODELS.remove(o)
    obj.name = name
    obj.data.remesh_voxel_size = voxel
    bpy.ops.object.voxel_remesh()
    mod = obj.modifiers.new('Sculpt surface relaxation', 'SMOOTH')
    mod.factor, mod.iterations = .35, 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.calc_loop_triangles()
    mod = obj.modifiers.new('Game topology', 'DECIMATE')
    mod.ratio = min(1, triangle_limit / len(obj.data.loop_triangles))
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def plate(name, outline, center, bone, surface='iron', color=None, thickness=.018, rings=5):
    v, f = [center], []
    n = len(outline)
    for ring in range(1, rings+1):
        r = ring / rings
        for p in outline:
            v.append((center[0] + (p[0]-center[0])*r,
                      center[1] + (p[1]-center[1])*r,
                      center[2] + (p[2]-center[2])*r*r))
        for j in range(n):
            a, b = 1+(ring-1)*n+j, 1+(ring-1)*n+(j+1)%n
            f.append((0, a, b) if ring == 1 else (a-n, a, b, b-n))
    front_count = len(v)
    v.extend((x, y, z-thickness) for x, y, z in v[:])
    f.extend(tuple(i+front_count for i in reversed(face)) for face in f[:])
    for j in range(n):
        a, b = 1+(rings-1)*n+j, 1+(rings-1)*n+(j+1)%n
        f.append((a, a+front_count, b+front_count, b))
    obj = mesh(name, v, f, bone, surface, color)
    return obj


def rim(name, outline, bone, surface='iron', color='#887b64', radius=.009):
    return tube(name, outline + outline[:2], radius, bone, surface, color, sides=6,
                steps=len(outline)*3)


def stud(name, p, bone, r=.017, color='#aa906d'):
    return ellipsoid(name, p, (r, r, r*.6), bone, 'iron', color, sides=12, rings=7)


def band(name, y, rx, rz, cx, cz, h, bone, color='#6e5139', tilt=0):
    return loft(name, [(y-h/2, rx, rz, cx, cz), (y-h*.28, rx+.006, rz+.006, cx, cz),
                       (y+h*.28, rx+.006, rz+.006, cx, cz), (y+h/2, rx, rz, cx, cz)],
                bone, 'leather', color, sides=24, steps=4,
                sculpt=lambda x, yy, z, a: (x, yy + math.sin(a)*tilt, z))


def rectangle_frame(name, cx, y, z, w, h, bone='body', angle=0, color='#a68a53'):
    radius=min(w,h)*.10
    corners=[]
    for x,dy,start in [(w/2-radius,-h/2+radius,-math.pi/2),
                       (w/2-radius,h/2-radius,0),(-w/2+radius,h/2-radius,math.pi/2),
                       (-w/2+radius,-h/2+radius,math.pi)]:
        for j in range(4):
            a=start+j/3*math.pi/2
            corners.append((x+radius*math.cos(a),dy+radius*math.sin(a)))
    p = [(cx + x*math.cos(angle)-dy*math.sin(angle), y+x*math.sin(angle)+dy*math.cos(angle), z)
         for x, dy in corners]
    rim(name, p, bone, color=color, radius=.012)
    tube(name+' / tongue', [(cx-w*.3,y,z+.009),(cx+w*.1,y,z+.009)], .009,
         bone, 'iron', color, sides=6, steps=2)


def surface_depth(obj, x, y, front=True):
    hit, loc, _, _ = obj.ray_cast(world((x, y, 2 if front else -2)), world((0, 0, -1 if front else 1)))
    return game(loc).z if hit else (.2 if front else -.2)


def build_body():
    rows = [(1.23,.35,.215,0,0), (1.37,.365,.215,0,0), (1.53,.4,.22,0,0),
            (1.72,.46,.24,0,-.02), (1.91,.545,.255,0,-.025), (2.02,.52,.225,0,-.04),
            (2.10,.365,.205,0,-.025), (2.17,.22,.175,0,-.015), (2.27,.18,.16,0,-.005)]
    def sculpt(x,y,z,a):
        front = max(0, math.cos(a))**3
        side = 1 if x >= 0 else -1
        pec_y = 1.92 + (abs(x)-.25)*.22
        pec = math.exp(-((x-side*.25)/.255)**4 - ((y-pec_y)/.13)**4)
        abs_detail = sum(.073*math.exp(-((abs(x)-.112)/.103)**4-((y-yy)/.048)**4)
                         for yy in (1.445,1.565,1.68))
        oblique = .034*gauss((abs(x)-(.255+.18*(y-1.45)))/.055)*gauss((y-1.54)/.19)
        cleft = .037*gauss(x/.02)*gauss((y-1.69)/.31)
        abdominal_grooves = sum(.021*gauss((y-yy)/.012)*gauss(x/.28) for yy in (1.505,1.623))
        pec_crease = .022*gauss((y-(1.785+.2*(abs(x)-.22)))/.018)*gauss((abs(x)-.24)/.23)
        z += front*(pec*.079 + abs_detail + oblique - cleft - pec_crease - abdominal_grooves)
        back = max(0,-math.cos(a))**3
        z -= back*(.035*gauss((abs(x)-.23)/.17)*gauss((y-1.9)/.22) - .02*gauss(x/.04))
        return x,y,z
    return loft('Torso / pectorals, abs, obliques and trapezius', rows, sides=64, steps=58, sculpt=sculpt)


def build_head():
    rows = [(2.18,.09,.10,0,.015),(2.225,.187,.15,0,.015),(2.28,.236,.17,0,.0),
            (2.36,.225,.185,0,-.015),(2.44,.242,.205,0,-.025),(2.54,.252,.205,0,-.035),
            (2.64,.242,.205,0,-.045),(2.71,.215,.17,0,-.045),(2.75,.135,.105,0,-.04),
            (2.765,.012,.02,0,-.045)]
    def sculpt(x,y,z,a):
        front=max(0,math.cos(a))**3
        nose=.12*gauss(x/.075)*gauss((y-2.463)/.075)
        bridge=.075*gauss(x/.037)*gauss((y-2.54)/.095)
        chin=.063*gauss(x/.185)*gauss((y-2.264)/.058)
        muzzle=.048*gauss(x/.175)*gauss((y-2.352)/.054)
        cheek=.066*gauss((abs(x)-.194)/.054)*gauss((y-2.467)/.085)
        eye=.065*gauss((abs(x)-.127)/.083)*gauss((y-2.537)/.045)
        hollow=.044*gauss((abs(x)-.188)/.048)*gauss((y-2.374)/.045)
        return x,y,z+front*(nose+bridge+chin+muzzle+cheek-eye-hollow)
    head=loft('Head / continuous facial sculpture', rows, sides=64, steps=64, sculpt=sculpt)
    brows=[]
    for side in (-1,1):
        brows.append(tube('Brow / compressed angular ridge', [(side*.041,2.575,.235),
            (side*.105,2.566,.225),(side*.185,2.597,.189),(side*.228,2.596,.154)],
            lambda t: .046*(math.sin(math.pi*t)**.5*.85+.28), color='#56643b', sides=12, steps=16, flatten=.68))
    nose=ellipsoid('Nose / broad sculpted bulb',(0,2.478,.293),(.074,.05,.077),sides=24,rings=16)
    nostril_forms=[ellipsoid('Nose / alar fold',(side*.06,2.452,.273),(.034,.029,.047),
                            sides=20,rings=12) for side in (-1,1)]
    chin=ellipsoid('Chin / rounded lower-jaw volume',(0,2.252,.177),(.18,.071,.088),power=2.5,sides=28,rings=16)
    head=union([head]+brows+[nose,chin]+nostril_forms,'Head / sculpted brow and muzzle',.0065,6100)
    for side in (-1,1):
        # A solid curved ear with recessed inner folds, not a flat triangular attachment.
        outline=[(side*.239,2.487,-.017),(side*.272,2.603,-.022),(side*.367,2.644,-.04),
                 (side*.458,2.638,-.075),(side*.408,2.566,-.067),(side*.315,2.493,-.033)]
        plate('Ear / curved rim',outline,(side*.318,2.567,.034),'body','skin','#7c8850',.035,5)
        inner=[(side*.282,2.537,.031),(side*.299,2.596,.025),(side*.41,2.618,-.032),
               (side*.362,2.558,.001)]
        plate('Ear / inner fold',inner,(side*.327,2.574,.018),'body','skin','#495736',.008,3)
        tube('Ear / cartilage',[(side*.275,2.52,.033),(side*.3,2.558,.048),(side*.331,2.585,.039)],
             .011,color='#8a9361',tip=.004,sides=6,steps=7)
        x,y=side*.127,2.532
        depth=surface_depth(head,x,y)
        # The socket and iris share a slanted almond contour; the brow covers the upper lid.
        def almond(name,cx,cy,rx,ry,z,surface,color):
            v=[(cx,cy,z+.012)];f=[]
            for j in range(32):
                a=j/32*math.tau
                dx=math.cos(a)*rx
                dy=math.sin(a)*ry*.85+side*dx*.20
                v.append((cx+dx,cy+dy,z-.005+abs(dx)*.06))
            for j in range(32): f.append((0,j+1,(j+1)%32+1))
            return mesh(name,v,f,'body',surface,color)
        almond('Eye / deep socket',x,y,.082,.032,depth+.012,'dark','#263021')
        almond('Eye / amber iris',x,y-.005,.047,.014,depth+.027,'eye','#eeb846')
        ellipsoid('Eye / vertical pupil',(x+side*.004,y-.005,depth+.043),(.009,.011,.005),
                  surface='dark',color='#1e2619',sides=12,rings=7)
        lower=[(x-side*.072,y-.012,depth+.005),(x,y-.032,depth+.012),(x+side*.067,y-.016,depth+.009)]
        tube('Eye / lower lid',lower,.009,color='#586b3b',tip=.006,sides=6,steps=9)
        nx,ny=side*.054,2.448
        nz=surface_depth(head,nx,ny)
        ellipsoid('Nose / nostril recess',(nx,ny-.008,nz+.002),(.023,.012,.008),
                  surface='dark',color='#303725',rotation=side*.18,sides=14,rings=7)
        tube('Face / nasolabial fold',[(side*.09,2.416,surface_depth(head,side*.09,2.416)+.001),
             (side*.137,2.373,surface_depth(head,side*.137,2.373)+.002),
             (side*.164,2.333,surface_depth(head,side*.164,2.333)+.002)],.004,
             color='#536337',tip=.002,sides=5,steps=8)
        tube('Tusk / lower-jaw ivory',[(side*.173,2.293,.205),(side*.188,2.365,.263),
             (side*.173,2.451,.268)],lambda t:.044*(1-t)**.75+.001,
             surface='ivory',sides=10,steps=12)
        tube('Face / cheek scar',[(side*.191,2.529,surface_depth(head,side*.191,2.529)+.003),
             (side*.204,2.493,surface_depth(head,side*.204,2.493)+.003),
             (side*.212,2.445,surface_depth(head,side*.212,2.445)+.003)],.003,
             color='#a47e55',tip=.001,sides=4,steps=7)
    # Sculpted frown, separate lip volumes, and small teeth in the opening.
    mouth=[(-.166,2.323,.212),(-.083,2.346,.239),(0,2.351,.245),(.083,2.346,.239),(.166,2.323,.212)]
    tube('Mouth / opening',mouth,.014,surface='dark',color='#2b2d20',sides=8,steps=18,flatten=.65)
    tube('Mouth / lower lip',[(-.155,2.30,.216),(-.075,2.317,.257),(0,2.316,.264),
         (.075,2.317,.257),(.155,2.30,.216)],.023,color='#7c8852',tip=.015,sides=10,steps=18,flatten=.70)
    for x in (-.079,.064):
        tube('Mouth / small tooth',[(x,2.335,.25),(x,2.357,.247)],.012,
             surface='ivory',tip=.002,sides=7,steps=3)
    tube('Chin / cleft',[(0,2.273,surface_depth(head,0,2.273)+.002),
         (0,2.242,surface_depth(head,0,2.242)+.002)],.003,color='#54653d',tip=.001,sides=4,steps=4)
    return head


def build_hair():
    def sculpt(x,y,z,a):
        groove=.005*math.sin(a*7+.6)*max(0,math.cos(a))
        hairline=-.028*gauss(x/.065)*max(0,math.cos(a))*gauss((y-2.735)/.035)
        return x,y+groove+hairline,z+.009*math.cos(a*7)
    loft('Hair / swept continuous crown',[(2.735,.18,.19,0,-.035),
         (2.786,.20,.183,0,-.042),(2.832,.12,.132,0,-.062),
         (2.85,.035,.052,0,-.09)],surface='dark',color='#302923',sides=36,steps=16,sculpt=sculpt)
    tube('Hair / compact curved topknot',[(0,2.832,-.09),(0,2.88,-.1),(-.006,2.928,-.104),
         (-.018,2.958,-.11),(-.052,2.942,-.127)],
         lambda t:.048*(.6+math.sin(math.pi*t)*.55)*(1-.35*t),surface='dark',color='#282421',
         sides=14,steps=20,flatten=.85)
    band('Hair / leather tie',2.865,.061,.057,0,-.099,.028,'body','#946133')
    tube('Hair / trailing rear clump',[(0,2.754,-.204),(0,2.674,-.228),(.012,2.58,-.222)],
         lambda t:.073*(1-t)+.002,surface='dark',color='#29251f',sides=10,steps=12)
    for j in range(5):
        off=(j-2)*.016
        tube('Hair / sculpted strand',[(off,2.842,-.045),(off,2.885,-.05),
             (off-.009,2.923,-.073),(off-.033,2.931,-.107)],.0013,
             surface='dark',color='#41362d',tip=.0005,sides=4,steps=12)


def build_arm(side):
    bone='leftArm' if side<0 else 'rightArm'
    rows=[(1.12,.125,.125,side*.87,.025),(1.31,.18,.18,side*.88,.011),
          (1.48,.195,.178,side*.855,0),(1.60,.14,.145,side*.83,-.006),
          (1.80,.22,.22,side*.76,-.025),(2.01,.245,.23,side*.69,-.03),
          (2.14,.17,.16,side*.67,-.035)]
    def sculpt(x,y,z,a):
        z += max(0,math.cos(a))**3*(.035*gauss((y-1.81)/.13)+.024*gauss((y-1.43)/.12))
        return x,y,z
    arm=loft('Arm / deltoid, biceps and tapered elbow',rows,bone,sides=36,steps=36,sculpt=sculpt)
    parts=[arm,ellipsoid('Hand / clenched palm',(side*.873,1.055,.066),(.155,.119,.118),bone,
                         power=3,sides=24,rings=14)]
    for finger in range(4):
        x=side*(.872+(finger-1.5)*.068)
        yy=1.039+[.009,.019,.01,-.016][finger]
        parts.append(ellipsoid('Finger / knuckle',(x,yy,.155),(.039,.057,.048),bone,power=3,sides=14,rings=9))
        parts.append(ellipsoid('Finger / curled tip',(x,yy-.065,.126),(.034,.045,.041),bone,power=3,sides=14,rings=9))
    parts.append(ellipsoid('Thumb / over curled fingers',(side*.779,1.086,.163),(.086,.048,.046),bone,
                           rotation=side*-.5,power=2.6,sides=18,rings=10))
    arm=union(parts,'Arm and fist / continuous sculpture',.0095,2900)
    for j in range(3):
        x=side*(.872+(j-1)*.068)
        tube('Hand / finger crease',[(x,1.039,.198),(x,1.008,.19),(x,.98,.151)],.003,
             bone,color='#4a5d34',tip=.0015,sides=4,steps=5)
    # Cuff follows the narrowing forearm, with curved sloping rims and an overlapping front flap.
    loft('Bracer / thick flared leather',[(1.17,.18,.21,side*.875,.025),
         (1.21,.20,.23,side*.88,.023),(1.43,.25,.254,side*.86,.003),
         (1.495,.26,.26,side*.85,0)],bone,'leather','#432c24',sides=32,steps=15,
         sculpt=lambda x,y,z,a:(x,y+math.sin(a)*side*.045,z))
    band('Bracer / upper rolled edge',1.481,.266,.269,side*.853,.005,.035,bone,tilt=side*.045)
    band('Bracer / wrist rolled edge',1.184,.195,.229,side*.875,.025,.03,bone,tilt=side*.025)
    outline=[(side*.876-.12,1.20,.235),(side*.876+.123,1.195,.233),
             (side*.85+.17,1.467,.245),(side*.85-.172,1.48,.245)]
    plate('Bracer / overlapping panel',outline,(side*.87,1.336,.281),bone,'leather','#51372a',.018,4)
    for y in (1.23,1.45):
        stud('Bracer / brass fastener',(side*.948,y,.271),bone,.014)
    for j in range(6):
        y=1.235+j*.037
        tube('Bracer / seam stitch',[(side*.81,y,.284),(side*.81+.012,y+.007,.285)],.002,
             bone,'leather','#876b45',sides=4,steps=1)


def dome(name,cx,cy,rx,rz,ry,bone,color):
    v,f=[],[]
    sides,rings=32,12
    for row in range(rings+1):
        phi=.015+row/rings*1.62
        for j in range(sides):
            a=j/sides*math.tau
            v.append((cx+rx*math.sin(phi)*math.sin(a),cy+ry*math.cos(phi),rz*math.sin(phi)*math.cos(a)))
            if row<rings:
                k,n=row*sides+j,row*sides+(j+1)%sides
                f.append((k,n,n+sides,k+sides))
    front=len(v)
    v.extend((cx+(x-cx)*.94,y-.014,z*.94) for x,y,z in v[:])
    f.extend(tuple(i+front for i in reversed(face)) for face in f[:])
    for j in range(sides):
        a,b=rings*sides+j,rings*sides+(j+1)%sides
        f.append((a,a+front,b+front,b))
    obj=mesh(name,v,f,bone,'iron',color)
    rim(name+' / forged edge',[(cx+rx*math.sin(j/24*math.tau),cy-.012,
         rz*math.cos(j/24*math.tau)) for j in range(24)],bone,color='#6d675d',radius=.01)
    return obj


def build_armor():
    shell=dome('Pauldron / unspiked convex shell',.69,2.042,.267,.255,.15,'rightArm','#434551')
    for obj in [shell,MODELS[-1]]:
        for vertex in obj.data.vertices:
            p=game(vertex.co)
            p.y-=(p.x-.69)*.22
            vertex.co=world(p)
    dome('Pauldron / spiked support shell',-.695,2.055,.277,.26,.154,'leftArm','#414650')
    outline=[(-1.003,2.075,.05),(-.955,2.201,.105),(-.816,2.267,.14),
             (-.622,2.253,.19),(-.434,2.177,.16),(-.426,2.046,.239),
             (-.527,1.977,.287),(-.718,1.992,.286),(-.922,2.061,.181)]
    plate('Pauldron / main forged convex plate',outline,(-.713,2.119,.326),'leftArm',color='#474952',thickness=.027)
    rim('Pauldron / raised bevel',outline,'leftArm',color='#87765d',radius=.009)
    lower=[(-1.02,2.009,.04),(-.952,2.068,.14),(-.788,2.077,.22),
           (-.588,2.014,.226),(-.626,1.937,.199),(-.832,1.952,.169)]
    plate('Pauldron / overlapping lower plate',lower,(-.844,2.002,.261),'leftArm',color='#4b4c52',thickness=.023)
    rim('Pauldron / lower bevel',lower,'leftArm',color='#71614c',radius=.008)
    for p in [(-.54,2.037,.299),(-.714,2.025,.317),(-.89,2.099,.234)]:
        stud('Pauldron / large rivet',p,'leftArm',.019)
    for p in [(.542,2.042,.215),(.74,2.064,.254)]:
        stud('Pauldron / rivet',p,'rightArm',.013)
    for i,(points,r) in enumerate([
        ([(-.861,2.236,.05),(-.9,2.374,.067),(-.941,2.49,.064)],.065),
        ([(-.645,2.244,.112),(-.668,2.417,.12),(-.725,2.56,.129)],.079),
        ([(-.482,2.048,.27),(-.501,2.132,.333),(-.525,2.249,.334)],.051)]):
        tube('Pauldron / ivory horn '+str(i),points,lambda t:r*(1-t)**.78+.001,
             'leftArm','ivory',sides=12,steps=12)
    # Restrained edge scuffs follow the forged front plate's surface.
    for j,(x,y,z) in enumerate([(-.87,2.132,.27),(-.73,2.163,.329),(-.62,2.061,.322)]):
        tube('Pauldron / edge wear',[(x,y,z),(x+.026,y+.01,z-.003),(x+.04,y+.024,z-.014)],
             .0026,'leftArm','iron','#918675',tip=.001,sides=3,steps=3)


def build_clothes(torso):
    thighs=[obj for obj in MODELS if obj.name.startswith('Thigh /')]
    loft('Belt / curved thick waist leather',[(1.258,.406,.244,0,0),(1.283,.422,.257,0,0),
         (1.414,.409,.246,0,0),(1.44,.392,.236,0,0)],surface='leather',color='#423029',sides=48,steps=8)
    for y in (1.281,1.421):
        tube('Belt / reinforced edge',[(math.sin(j/48*math.tau)*.414,y,
             math.cos(j/48*math.tau)*.252) for j in range(50)],.004,
             surface='leather',color='#745538',sides=4,steps=48)
    rectangle_frame('Belt / square brass buckle',0,1.353,.284,.18,.174)
    for x in (-.29,-.17,.19,.30):
        stud('Belt / rivet',(x,1.354,math.sqrt(max(.001,1-(x/.418)**2))*.258),'body',.015)
    for j,angle in enumerate([0,-.55,.55,-1.15,1.15,-1.85,1.85,-2.5,2.5,math.pi]):
        apron=j==0
        length=.53 if apron else .39+(j%3)*.018
        half=.30 if apron else .36
        def point(u,t,back=0):
            a=angle+(u-.5)*2*half*(1-t*.12)
            radius=.433+(1-t)*(.035 if apron else .085)
            depth=.293+(1-t)*(.035 if apron else .043)
            fold=.012*math.sin(u*math.tau+j*.6)*(1-t)
            y=1.304-(1-t)*length+(1-t)**2*.012*math.cos(u*math.tau)
            x=math.sin(a)*(radius+fold-back)
            z=math.cos(a)*(depth+fold-back)+(.01 if apron else 0)
            sign=1 if math.cos(a)>0 else -1
            for thigh in thighs:
                hit,loc,_,_=thigh.ray_cast(world((x,y,2*sign)),world((0,0,-sign)))
                if hit:
                    z=sign*max(sign*z,sign*game(loc).z+.027-back)
            return x,y,z
        rows,cols=6,8
        v,f=[],[]
        for back in (0,.018):
            for r in range(rows+1):
                for c in range(cols+1): v.append(point(c/cols,r/rows,back))
        count=(rows+1)*(cols+1)
        for r in range(rows):
            for c in range(cols):
                k=r*(cols+1)+c
                face=(k,k+1,k+cols+2,k+cols+1)
                f.extend([face,tuple(i+count for i in reversed(face))])
        edge=[*range(cols),*[r*(cols+1)+cols for r in range(rows)],
              *[count-1-c for c in range(cols)],*[(rows-r)*(cols+1) for r in range(rows)]]
        for a,b in zip(edge,edge[1:]+edge[:1]):f.append((a,a+count,b+count,b))
        mesh('Skirt / front apron' if apron else 'Skirt / overlapping leather panel '+str(j),
             v,f,'body','leather','#483129' if j%2 else '#50372b')
        for u in (.03,.97):
            tube('Skirt / reinforced seam',[point(u,t/12) for t in range(13)],.0045,
                 surface='leather',color='#755235',sides=4,steps=12)
            for st in range(1,7):
                tube('Skirt / stitch',[point(u,st/8),point(u,st/8+.02)],.0018,
                     surface='leather',color='#957249',sides=3,steps=1)
        if j in (1,2):
            for u in (.18,.82): stud('Skirt / mounting rivet',point(u,.92),'body',.01)
    path=sample_curve([(-.4,2.08,0),(-.3,1.996,0),(-.12,1.814,0),(.055,1.619,0),(.295,1.419,0)],44)
    def strap_depth(x,y,front=True):
        # Leather bridges muscle grooves instead of sinking into each abdominal recess.
        sign=1 if front else -1
        samples=[surface_depth(torso,x+d*.67,y-d*.74,front)*sign for d in (-.05,-.025,0,.025,.05)]
        return max(samples)*sign
    for front in (True,False):
        v,f=[],[]
        cols=6
        stride=cols+1
        count=45*stride
        for back in (0,.017):
            for i,p in enumerate(path):
                d=(path[min(44,i+1)]-path[max(0,i-1)]).normalized()
                for column in range(cols+1):
                    side=column/cols*2-1
                    x=p.x-d.y*side*.058
                    y=p.y+d.x*side*.058
                    z=strap_depth(x,y,front)+(1 if front else -1)*(.015+back)
                    v.append((x,y,z))
        for i in range(44):
            for column in range(cols):
                k=i*stride+column
                f.extend([(k,k+1,k+stride+1,k+stride),
                          (k+count,k+stride+count,k+stride+count+1,k+count+1)])
        for i in range(44):
            k=i*stride
            for a,b in ((k,k+stride),(k+cols,k+stride+cols)):f.append((a,a+count,b+count,b))
        for column in range(cols):
            k=44*stride+column
            f.extend([(column,column+count,column+count+1,column+1),
                      (k,k+1,k+count+1,k+count)])
        mesh('Chest strap / fitted front' if front else 'Chest strap / fitted rear',v,f,'body','leather','#4e3529')
    p=path[15]
    z=strap_depth(p.x,p.y)+.045
    rectangle_frame('Chest strap / brass buckle',p.x,p.y,z,.145,.105,angle=-.73)
    p=path[6]
    rectangle_frame('Chest strap / upper brass buckle',p.x,p.y,strap_depth(p.x,p.y)+.045,
                    .123,.088,angle=-.73)
    for side in (-1,1):
        pts=[]
        for i,p in enumerate(path):
            d=(path[min(44,i+1)]-path[max(0,i-1)]).normalized()
            x,y=p.x-d.y*side*.058,p.y+d.x*side*.058
            pts.append((x,y,strap_depth(x,y)+.028))
        tube('Chest strap / raised edge',pts,.0035,surface='leather',color='#765236',sides=4,steps=44)


def build_leg(side):
    bone='leftLeg' if side<0 else 'rightLeg'
    rows=[(.70,.12,.13,side*.414,0),(.82,.147,.15,side*.398,.008),
          (.96,.19,.185,side*.357,.001),(1.15,.205,.205,side*.287,-.025),
          (1.285,.172,.181,side*.239,-.021)]
    def sculpt(x,y,z,a):
        z+=max(0,math.cos(a))**3*(.029*gauss((y-1.01)/.14)+.012*math.cos(a*3))
        return x,y,z
    loft('Thigh / quadriceps and inner teardrop',rows,bone,sides=36,steps=27,sculpt=sculpt)
    cx=side*.457
    bootrows=[(.044,.204,.32,cx,.094),(.085,.219,.333,cx,.094),(.12,.212,.321,cx,.10),
              (.22,.199,.294,cx,.081),(.31,.165,.199,cx,.033),(.39,.147,.151,cx,.005),
              (.56,.151,.16,cx,-.009),(.70,.168,.174,cx,-.012),(.77,.181,.184,cx,-.014)]
    boot=loft('Boot / fitted layered leather',bootrows,bone,'leather','#3c2c25',sides=32,steps=30)
    band('Boot / dark outsole',.068,.219,.334,cx,.094,.041,bone,'#292720')
    band('Boot / sole welt',.104,.214,.327,cx,.094,.013,bone,'#6c5942')
    for y,rx,rz,cz,h in [(.72,.199,.206,-.009,.065),(.43,.174,.185,.004,.073),
                         (.33,.18,.215,.021,.072)]:
        band('Boot / rolled cuff' if y>.6 else 'Boot / overlapping ankle strap',y,rx,rz,cx,cz,h,bone,
             '#684a33',tilt=side*.027)
        stud('Boot / strap fastener',(cx+side*.126,y,.145),bone,.013)
    toe=ellipsoid('Boot / rounded charcoal toe cap',(cx,.193,.256),(.222,.101,.217),bone,
                  'iron','#42444d',sides=28,rings=14)
    # Knee armor wraps around the front, with a broad raised crown and a beveled perimeter.
    kx=side*.397
    outline=[(kx-.126,.96,.141),(kx+.125,.952,.141),(kx+.166,.856,.174),
             (kx+.124,.751,.172),(kx+.024,.724,.184),(kx-.112,.743,.161),(kx-.16,.842,.164)]
    plate('Knee / forged convex guard',outline,(kx,.838,.257),bone,color='#3c4049',thickness=.024,rings=5)
    rim('Knee / raised bevel',outline,bone,color='#796f5f',radius=.0065)
    # The stance is authored into the asset so a neutral joint transform does not alter its silhouette.
    for obj in [o for o in MODELS if o['creature_bone']==bone]:
        for vertex in obj.data.vertices:
            p=game(vertex.co)
            angle=side*.14*max(0,min(1,(.95-p.y)/.55))
            x,z=p.x-cx,p.z-.01
            p.x=cx+x*math.cos(angle)+z*math.sin(angle)
            p.z=.01-x*math.sin(angle)+z*math.cos(angle)
            vertex.co=world(p)
        obj.data.update()


def paint_models():
    # Bake local contact occlusion into the same vertex palette exported to Three.js.
    vertices,faces=[],[]
    for obj in MODELS:
        obj.data.calc_loop_triangles()
        start=len(vertices)
        vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        faces.extend(tuple(start+i for i in tri.vertices) for tri in obj.data.loop_triangles)
    bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
    rng=random.Random(6247)
    # Project the supplied front/rear sheet into Blender's vertex-paint layer.
    # Material-aware sampling rejects background, skin on leather, and armor on skin.
    ref_path=ROOT/'local-artifacts/enemy-concepts/orc-concept.png'
    ref=bpy.data.images.load(str(ref_path),check_existing=True) if ref_path.exists() else None
    if ref:
        import numpy as np
        rw,rh=ref.size
        pixels=np.asarray(ref.pixels[:],dtype=float).reshape(rh,rw,4)
        channels=pixels[:,:,:3]
        r,g,b=channels[:,:,0],channels[:,:,1],channels[:,:,2]
        masks={
            'skin':(g>.22)&(g>r*.98)&(g>b*1.18),
            'leather':(r>.10)&(r>g*1.13)&(r>b*1.3),
            'iron':(r>.12)&(abs(r-g)<.13)&(b>r*.74)&~((g>r*1.02)&(g>b*1.18)),
            'dark':(r<.28)&(g<.28)&(b<.28),
        }
        # Pixels are converted by Blender to scene-linear values for byte palettes.
        def project(p,surface,normal):
            if surface not in masks or abs(normal.z)<.18:return None
            front=normal.z>=0
            x=round((976 if front else 1338)+(p.x if front else -p.x)*150)
            y=round(578-p.y*150)
            y=rh-1-y
            radius=12 if surface=='skin' else 8
            if not (radius<=x<rw-radius and radius<=y<rh-radius):return None
            ys,xs=np.nonzero(masks[surface][y-radius:y+radius+1,x-radius:x+radius+1])
            if not len(xs):return None
            best=np.argmin((xs-radius)**2+(ys-radius)**2)
            if (xs[best]-radius)**2+(ys[best]-radius)**2>radius**2:return None
            return pixels[y-radius+ys[best],x-radius+xs[best],:3]
    for obj in MODELS:
        surface=obj['creature_surface']
        base=rgb(obj['paint_color'])
        attr=obj.data.color_attributes.get('Paint') or obj.data.color_attributes.new(name='Paint',type='FLOAT_COLOR',domain='POINT')
        for vertex in obj.data.vertices:
            p=game(vertex.co)
            n=vertex.normal.normalized()
            tangent=n.cross(Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))).normalized()
            bitangent=n.cross(tangent)
            shade=1
            for k in range(6):
                a=k/6*math.tau
                direction=(n*.72+tangent*math.cos(a)*.5+bitangent*math.sin(a)*.5).normalized()
                hit,_,_,distance=bvh.ray_cast(vertex.co+n*.0028,direction,.14)
                if hit is not None:
                    shade-=.085*(1-distance/.18)
            variation=1+.035*math.sin(p.x*23+p.y*9)*math.cos(p.z*17-p.y*12)
            if surface=='skin':
                # Broad painted planes follow the sculpture's local normal rather than random UV polygons.
                gn=game(n)
                variation*=.91+.09*max(0,gn.y*.65+gn.z*.35)+.025*math.sin(p.x*35+p.y*24+p.z*15)
                if obj.name.startswith('Head'):
                    brow=.7*gauss((abs(p.x)-.14)/.11)*gauss((p.y-(2.578+.3*(abs(p.x)-.14)))/.035)*(1 if p.z>.12 else 0)
                    shade*=1-brow
            elif surface=='iron':
                variation*=.94+.12*max(0,game(n).y)
            elif surface=='ivory':
                variation*=.88+.12*max(0,game(n).y)
            elif surface=='leather':
                variation*=.92+.075*math.sin(p.x*49+p.y*17)*math.sin(p.z*41+p.y*31)
            pigment=base
            if ref:
                sample=project(p,surface,game(n))
                if sample is not None:
                    weight=.70 if surface=='skin' else .76
                    # Image pixels in Blender are stored as sRGB for this loaded PNG.
                    pigment=tuple(c*(1-weight)+linear(float(s))*weight for c,s in zip(base,sample))
            attr.data[vertex.index].color=tuple(max(.003,min(1,c*shade*variation)) for c in pigment)+(1,)
        obj.data.color_attributes.active_color=attr
        # Cylindrical authoring UVs are useful for hand painting in the saved file.
        uv=obj.data.uv_layers.new(name='UVMap')
        for loop in obj.data.loops:
            p=game(obj.data.vertices[loop.vertex_index].co)
            uv.data[loop.index].uv=(math.atan2(p.x,p.z)/math.tau+.5,p.y/3)


def optimize_models():
    """Keep facial forms and fists; simplify dense clothing grids and curved trim offline."""
    def count(obj):
        obj.data.calc_loop_triangles()
        return len(obj.data.loop_triangles)
    print('ORC_TOPOLOGY_BEFORE',sum(count(o) for o in MODELS),flush=True)
    for obj in MODELS:
        triangles=count(obj)
        if triangles<100:
            continue
        ratio=.94 if obj.name.startswith(('Head /','Arm and fist')) else .48
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Offline game reduction','DECIMATE')
        mod.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    print('ORC_TOPOLOGY_AFTER',sum(count(o) for o in MODELS),flush=True)


def fit_reference_proportions():
    head_prefixes=('Head /','Ear /','Eye /','Nose /','Face /','Tusk /','Mouth /','Chin /')
    for obj in MODELS:
        for vertex in obj.data.vertices:
            p=game(vertex.co)
            if obj.name.startswith(head_prefixes):
                p.x*=.91
                p.y=2.49+(p.y-2.49)*.95
            elif obj.name.startswith('Hair /'):
                p.x*=.87
                p.y-=.035
            if obj['creature_bone'] in ('leftLeg','rightLeg'):
                # Preserve sole/toe volume while lowering the knee and shortening the shaft.
                if p.y>.32:
                    t=min(1,(p.y-.32)/.40)
                    fade=max(0,min(1,(1.27-p.y)/.31)) if p.y>.96 else 1
                    p.y-=.14*(t*t*(3-2*t))*fade
            if obj['creature_bone']=='rightArm':
                p.x-=.065
            elif obj['creature_bone']=='leftArm':
                p.x-=.025
            vertex.co=world(p)
        obj.data.update()


def create_rig():
    data=bpy.data.armatures.new('Orc / game joint rig')
    rig=bpy.data.objects.new('Orc rig',data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name,pivot in PIVOTS.items():
        b=data.edit_bones.new(name)
        b.head=world(pivot)
        b.tail=world((pivot[0],pivot[1]+(.3 if name=='body' else -.4),pivot[2]))
        if name!='body': b.parent=data.edit_bones['body']
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.show_in_front=True
    for obj in MODELS:
        group=obj.vertex_groups.new(name=obj['creature_bone'])
        group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        mod=obj.modifiers.new('Game joint deformation','ARMATURE')
        mod.object=rig
        obj.parent=rig
    rig['coordinate_system']='X right, Blender Z up, Blender -Y forward'
    rig['export_pivots']=json.dumps(PIVOTS)
    return rig


def export_batches():
    batches={}
    for obj in MODELS:
        obj.data.calc_loop_triangles()
        surface,bone=obj['creature_surface'],obj['creature_bone']
        normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
        key=bone+':'+surface
        batch=batches.setdefault(key,{'vertices':{},'positions':[],'normals':[],'colors':[],'uv':[],'indices':[]})
        colors=obj.data.color_attributes['Paint']
        pivot=Vector(PIVOTS[bone])
        for tri in obj.data.loop_triangles:
            for loop_id in tri.loops:
                loop=obj.data.loops[loop_id]
                v=obj.data.vertices[loop.vertex_index]
                p=game(obj.matrix_world@v.co)-pivot
                n=game(normal_matrix@obj.data.corner_normals[loop_id].vector).normalized()
                c=colors.data[v.index if colors.domain=='POINT' else loop_id].color
                position=tuple(round(x*10000) for x in p)
                normal=tuple(round(x*127) for x in n)
                color=tuple(round(max(0,min(1,x))*255) for x in c[:3])
                u=(round((math.atan2(p.x,p.z)/math.tau+.5)*10000),round(p.y/3*10000))
                vertex_key=position+normal+color+u
                if vertex_key not in batch['vertices']:
                    batch['vertices'][vertex_key]=len(batch['positions'])//3
                    batch['positions'].extend(position)
                    batch['normals'].extend(normal)
                    batch['colors'].extend(color)
                    batch['uv'].extend(u)
                batch['indices'].append(batch['vertices'][vertex_key])
    def encoded(values,fmt):
        return base64.b64encode(struct.pack('<'+fmt*len(values),*values)).decode('ascii')
    packed={}
    for key,b in batches.items():
        if len(b['positions'])//3>65535: raise RuntimeError('16-bit batch vertex budget exceeded: '+key)
        packed[key]={k:encoded(b[k],fmt) for k,fmt in [('positions','h'),('normals','b'),('colors','B'),('uv','h'),('indices','H')]}
    triangles=sum(len(b['indices'])//3 for b in batches.values())
    if triangles>40000: raise RuntimeError('Orc triangle budget exceeded: '+str(triangles))
    DATA.write_text(json.dumps({'source':'assets/enemies/orc.blend','blenderVersion':bpy.app.version_string,
        'pivots':PIVOTS,'triangles':triangles,'batches':packed},indent=2)+'\n',encoding='utf-8')
    print('ORC_EXPORT',json.dumps({'triangles':triangles,'batches':len(packed),'payloadBytes':DATA.stat().st_size}),flush=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in MODELS:obj.select_set(True)
    rig=bpy.data.objects.get('Orc rig')
    if rig:rig.select_set(True)
    GLB.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,
                              export_animations=False,export_cameras=False,export_lights=False,
                              export_attributes=True,export_vertex_color='ACTIVE',export_extras=True)


def set_camera(camera,location,target):
    camera.location=world(location)
    camera.rotation_euler=(world(target)-camera.location).to_track_quat('-Z','Y').to_euler()


def setup_studio():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.device='CPU'
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=850
    scene.render.resolution_y=1100
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(*rgb('#72796a'),1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
    scene.view_settings.view_transform='AgX'
    camera_data=bpy.data.cameras.new('Concept comparison camera')
    camera=bpy.data.objects.new('Concept comparison camera',camera_data)
    scene.collection.objects.link(camera)
    camera_data.type='ORTHO'
    camera_data.ortho_scale=3.35
    set_camera(camera,(0,1.5,9),(0,1.5,0))
    scene.camera=camera
    def area(name,power,size,color,location,target):
        data=bpy.data.lights.new(name,'AREA')
        data.energy=power
        data.shape='DISK'
        data.size=size
        data.color=color
        obj=bpy.data.objects.new(name,data)
        scene.collection.objects.link(obj)
        obj.location=world(location)
        obj.rotation_euler=(world(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    area('Key / broad warm softbox',500,4,(1,.94,.82),(-3,4.5,4),(0,1.6,0))
    area('Fill / restrained frontal',100,3,(.83,.89,1),(3,2.6,4),(0,1.5,0))
    area('Rim / cool edge',550,3,(.74,.85,1),(2,4,-3),(0,1.8,0))
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0))
    ground=bpy.context.object
    ground.name='Studio floor'
    floor=bpy.data.materials.new('Studio floor / charcoal olive')
    floor.diffuse_color=(*rgb('#30332b'),1)
    floor.use_nodes=True
    floor.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*rgb('#30332b'),1)
    floor.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.93
    ground.data.materials.append(floor)
    ref=ROOT/'local-artifacts/enemy-concepts/orc-concept.png'
    if ref.exists():
        image=bpy.data.images.load(str(ref))
        image.pack()
        empty=bpy.data.objects.new('REFERENCE / supplied orc concept',None)
        scene.collection.objects.link(empty)
        empty.empty_display_type='IMAGE'
        empty.data=image
        empty.empty_display_size=4
        empty.location=world((3,1.5,-.5))
        empty.rotation_euler=(math.pi/2,0,0)
        empty.hide_render=True
    return camera


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--export-only',action='store_true')
    parser.add_argument('--no-render',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for path in (SOURCE.parent,RENDERS):path.mkdir(parents=True,exist_ok=True)
    if args.export_only:
        MODELS.extend(o for o in bpy.data.objects if o.type=='MESH' and 'creature_bone' in o)
        export_batches()
        return
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    torso=build_body()
    build_head()
    build_hair()
    build_arm(-1)
    build_arm(1)
    build_armor()
    build_leg(-1)
    build_leg(1)
    build_clothes(torso)
    print('ORC_SCULPT',len(MODELS),'editable objects',flush=True)
    fit_reference_proportions()
    optimize_models()
    paint_models()
    create_rig()
    camera=setup_studio()
    bpy.context.scene['art_reference']='Supplied HEXFALL orc concept, front / three-quarter / rear / face'
    bpy.context.scene['game_export']='src/game/orc-blender-data.json and public/models/orc.glb'
    export_batches()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
    if not args.no_render:
        for name,location,target,scale in [
            ('front',(0,1.5,9),(0,1.5,0),3.35),
            ('quarter',(3.8,2.7,8),(0,1.5,0),3.35),
            ('face',(0,2.49,8),(0,2.49,0),.97),
            ('rear',(0,1.5,-9),(0,1.5,0),3.35)]:
            set_camera(camera,location,target)
            camera.data.ortho_scale=scale
            bpy.context.scene.render.filepath=str(RENDERS/(name+'.png'))
            bpy.ops.render.render(write_still=True)
    print('ORC_DONE',str(SOURCE),flush=True)


if __name__=='__main__':
    main()
