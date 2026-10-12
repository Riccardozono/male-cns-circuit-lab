"""Offline Blender conversion in a fresh background process, never the user's scene."""
import argparse
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--report', required=True)
parser.add_argument('--inspect-only', action='store_true')
parser.add_argument('--tree-texture')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
source = Path(args.source).resolve()
if source.suffix.lower() == '.fbx':
    bpy.ops.import_scene.fbx(filepath=str(source), use_image_search=True)
elif source.suffix.lower() in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=str(source))
else:
    raise ValueError('Only the explicitly selected FBX/glTF model is imported')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if args.tree_texture:
    # This is the one texture actually supplied in the ZIP. Preserve all UVs
    # and artwork; replace broken absolute paths/absent atlas references.
    texture = bpy.data.images.load(str(Path(args.tree_texture).resolve()), check_existing=True)
    used = {s.material for o in meshes for s in o.material_slots if s.material}
    for material in used:
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        image = nodes.new('ShaderNodeTexImage')
        image.image = texture
        shader.inputs['Roughness'].default_value = 1
        material.node_tree.links.new(image.outputs['Color'], shader.inputs['Base Color'])
        material.node_tree.links.new(image.outputs['Alpha'], shader.inputs['Alpha'])
        material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        material.use_backface_culling = False
    # Keep original geometry/transforms/custom normals. The GLB preparation
    # bakes all transforms and normalizes both geometry and normals together.
    for obj in meshes:
        obj['assetVariant'] = obj.name
    for image in list(bpy.data.images):
        if image != texture and image.users == 0:
            bpy.data.images.remove(image)
report = {'sourceName': source.name, 'objects': []}
for obj in meshes:
    corners = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    report['objects'].append({'name': obj.name, 'vertices': len(obj.data.vertices),
        'triangles': sum(len(p.vertices) - 2 for p in obj.data.polygons),
        'worldMin': [min(p[i] for p in corners) for i in range(3)],
        'worldMax': [max(p[i] for p in corners) for i in range(3)],
        'materials': [s.material.name if s.material else None for s in obj.material_slots]})
report['images'] = [{'name': i.name, 'pathName': Path(i.filepath).name,
                     'size': list(i.size), 'hasData': i.has_data} for i in bpy.data.images]
report['materials'] = [{'name': m.name, 'textures': [n.image.name for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]} for m in bpy.data.materials if m.use_nodes and m.users]
Path(args.report).write_text(json.dumps(report, indent=2), encoding='utf8')
print(json.dumps(report))
if not args.inspect_only:
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == 'MESH')
    if not meshes:
        raise ValueError('No mesh imported')
    for image in bpy.data.images:
        if not image.users:
            continue
        if not image.has_data:
            raise ValueError('Missing source texture: ' + image.name)
        image.pack()
    bpy.ops.export_scene.gltf(filepath=str(Path(args.output).resolve()), export_format='GLB',
                              use_selection=True, export_extras=True,
                              export_yup=True, export_materials='EXPORT')
