"""Build the editable orc, render inspection views, and export the game's shared batches.

Run with Blender --background --factory-startup --python scripts/build-orc-blender.py.
To export hand edits: blender assets/enemies/orc.blend --background --python this.py -- --export-only.
Authoring coordinates are X right, Y up, Z forward, matching the game.
"""
import base64
import json
import math
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
              sides=64, rings=40):
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


def union(objects, name, voxel):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj = objects[0]
    for o in objects[1:]:
        MODELS.remove(o)
    obj.name = name
    obj.data.remesh_voxel_size = voxel
    bpy.ops.object.voxel_remesh()
    mod = obj.modifiers.new('Sculpt surface relaxation', 'SMOOTH')
    mod.factor, mod.iterations = .45, 6
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
        if len(obj.data.vertices)>20000:print('PAINT_MESH',obj.name,len(obj.data.vertices),flush=True)
        # Writing color attributes dirties Blender's derived normals. Cache them
        # first so a full sculpt does not recalculate all normals per vertex.
        normals=[v.normal.normalized().copy() for v in obj.data.vertices]
        for vertex in obj.data.vertices:
            p=game(vertex.co)
            n=normals[vertex.index]
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


def clean_export_slivers():
    """Remove only triangles that collapse in the actual exported coordinates."""
    def area_zero(a,b,c):
        u=tuple(b[i]-a[i] for i in range(3));v=tuple(c[i]-a[i] for i in range(3))
        return (u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])==(0,0,0)
    for obj in MODELS:
        pivot=Vector(PIVOTS[obj['creature_bone']])
        def packed_position(co):
            p=game(obj.matrix_world@co)-pivot
            return tuple(struct.unpack('<f',struct.pack('<f',round(c*10000)/10000))[0] for c in p)
        points=[packed_position(v.co) for v in obj.data.vertices]
        obj.data.calc_loop_triangles()
        bad={t.polygon_index for t in obj.data.loop_triangles
             if area_zero(*(points[i] for i in t.vertices))}
        if not bad:continue
        bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
        bmesh.ops.triangulate(bm,faces=[bm.faces[i] for i in bad])
        collapsed=[f for f in bm.faces if len(f.verts)==3 and area_zero(*(packed_position(v.co) for v in f.verts))]
        bmesh.ops.delete(bm,geom=collapsed,context='FACES_ONLY')
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        print('EXPORT_SLIVERS_REMOVED',obj.name,len(collapsed),flush=True)


def export_batches():
    clean_export_slivers()
    batches={}
    for obj in MODELS:
        obj.data.calc_loop_triangles()
        surface,bone=obj['creature_surface'],obj['creature_bone']
        normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
        key=bone+':'+surface
        batch=batches.setdefault(key,{'vertices':{},'positions':[],'normals':[],'colors':[],'uv':[],'indices':[]})
        colors=obj.data.color_attributes['Paint']
        pivot=Vector(PIVOTS[bone])
        # Snapshot Blender's derived corner-normal collection once. Requesting
        # the RNA collection per triangle corner is costly on dense sculpt meshes.
        normals=[tuple(round(x*127) for x in game(normal_matrix@n.vector).normalized())
                 for n in obj.data.corner_normals]
        fields=[]
        for vertex in obj.data.vertices:
            p=game(obj.matrix_world@vertex.co)-pivot
            fields.append((tuple(round(x*10000) for x in p),
                           (round((math.atan2(p.x,p.z)/math.tau+.5)*10000),round(p.y/3*10000))))
        pigments=[tuple(round(max(0,min(1,x))*255) for x in c.color[:3]) for c in colors.data]
        loop_vertices=[loop.vertex_index for loop in obj.data.loops]
        for tri in obj.data.loop_triangles:
            for loop_id in tri.loops:
                vertex_index=loop_vertices[loop_id]
                position,u=fields[vertex_index]
                normal=normals[loop_id]
                color=pigments[vertex_index if colors.domain=='POINT' else loop_id]
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
        packed[key]={k:encoded(b[k],fmt) for k,fmt in [('positions','h'),('normals','b'),('colors','B'),('uv','h'),('indices','I')]}
    triangles=sum(len(b['indices'])//3 for b in batches.values())
    DATA.write_text(json.dumps({'source':'assets/enemies/orc.blend','blenderVersion':bpy.app.version_string,
        'pivots':PIVOTS,'indexComponentType':5125,'triangles':triangles,'batches':packed},indent=2)+'\n',encoding='utf-8')
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
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    if '--export-only' in args:
        MODELS.extend(o for o in bpy.data.objects if o.type=='MESH' and 'creature_bone' in o)
        export_batches()
        return
    import importlib.util
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('orc_replacement', ROOT/'scripts/build-orc-replacement.py')
    replacement = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(replacement)
    replacement.main()


if __name__=='__main__':
    main()
