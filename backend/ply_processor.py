"""
PLY File Processing Module
Automatically generates info.json from PLY files in the public directory
"""
import os
import struct
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple, Optional


class PLYProcessor:
    """Process PLY files and generate scene metadata"""
    
    def __init__(self, ply_directory: str, output_path: str):
        self.ply_directory = Path(ply_directory)
        self.output_path = Path(output_path)
        
    def read_ply_header(self, filepath: Path) -> Optional[Dict]:
        """Read PLY file header to extract metadata without loading full geometry"""
        try:
            with open(filepath, 'rb') as f:
                # Check magic number
                magic = f.readline().decode('ascii').strip()
                if magic != 'ply':
                    return None
                
                vertex_count = 0
                face_count = 0
                format_type = None
                properties = []
                
                while True:
                    line = f.readline().decode('ascii').strip()
                    
                    if line.startswith('format'):
                        format_type = line.split()[1]
                    elif line.startswith('element vertex'):
                        vertex_count = int(line.split()[-1])
                    elif line.startswith('element face'):
                        face_count = int(line.split()[-1])
                    elif line.startswith('property'):
                        properties.append(line)
                    elif line == 'end_header':
                        break
                
                return {
                    'vertex_count': vertex_count,
                    'face_count': face_count,
                    'format': format_type,
                    'properties': properties
                }
        except Exception as e:
            print(f"Error reading PLY header {filepath}: {e}")
            return None
    
    def compute_bounding_box(self, filepath: Path) -> Optional[Dict[str, float]]:
        """Compute bounding box by reading vertex positions from PLY file"""
        try:
            with open(filepath, 'rb') as f:
                # Parse header
                header_lines = []
                while True:
                    line = f.readline().decode('ascii').strip()
                    header_lines.append(line)
                    if line == 'end_header':
                        break
                
                # Extract format and vertex count
                vertex_count = 0
                format_type = 'ascii'
                properties = []
                
                for line in header_lines:
                    if line.startswith('format'):
                        format_type = line.split()[1]
                    elif line.startswith('element vertex'):
                        vertex_count = int(line.split()[-1])
                    elif line.startswith('property'):
                        properties.append(line.split()[-1])  # property name
                
                # Find x, y, z indices
                try:
                    x_idx = properties.index('x')
                    y_idx = properties.index('y')
                    z_idx = properties.index('z')
                except ValueError:
                    print(f"PLY file {filepath} missing x/y/z properties")
                    return None
                
                # Initialize min/max
                min_x = min_y = min_z = float('inf')
                max_x = max_y = max_z = float('-inf')
                
                # Read vertices
                if format_type == 'ascii':
                    for _ in range(vertex_count):
                        line = f.readline().decode('ascii').strip()
                        if not line:
                            continue
                        parts = line.split()
                        if len(parts) > max(x_idx, y_idx, z_idx):
                            x = float(parts[x_idx])
                            y = float(parts[y_idx])
                            z = float(parts[z_idx])
                            
                            min_x = min(min_x, x)
                            max_x = max(max_x, x)
                            min_y = min(min_y, y)
                            max_y = max(max_y, y)
                            min_z = min(min_z, z)
                            max_z = max(max_z, z)
                
                elif format_type in ['binary_little_endian', 'binary_big_endian']:
                    # For binary formats, we need to know the full structure
                    # Simplified: assume float properties
                    endian = '<' if format_type == 'binary_little_endian' else '>'
                    
                    # Count bytes per vertex (simplified: assume all floats)
                    bytes_per_property = 4  # float32
                    bytes_per_vertex = len(properties) * bytes_per_property
                    
                    for _ in range(vertex_count):
                        vertex_data = f.read(bytes_per_vertex)
                        if len(vertex_data) < bytes_per_vertex:
                            break
                        
                        # Unpack all properties as floats
                        values = struct.unpack(f'{endian}{len(properties)}f', vertex_data)
                        
                        x = values[x_idx]
                        y = values[y_idx]
                        z = values[z_idx]
                        
                        min_x = min(min_x, x)
                        max_x = max(max_x, x)
                        min_y = min(min_y, y)
                        max_y = max(max_y, y)
                        min_z = min(min_z, z)
                        max_z = max(max_z, z)
                
                # Calculate size
                size_x = max_x - min_x
                size_y = max_y - min_y
                size_z = max_z - min_z
                
                # Calculate center
                center_x = (min_x + max_x) / 2
                center_y = (min_y + max_y) / 2
                center_z = (min_z + max_z) / 2
                
                return {
                    'x': round(size_x, 4),
                    'y': round(size_y, 4),
                    'z': round(size_z, 4),
                    'center': [
                        round(center_x, 4),
                        round(center_y, 4),
                        round(center_z, 4)
                    ]
                }
                
        except Exception as e:
            print(f"Error computing bounding box for {filepath}: {e}")
            return None
    
    def generate_object_name(self, filename: str) -> str:
        """Generate a clean object name from filename"""
        # Remove .ply extension
        name = filename.replace('.ply', '').replace('.PLY', '')
        
        # Replace underscores and hyphens with spaces, then title case
        # But keep original if it's already meaningful
        return name
    
    def generate_labels(self, filename: str) -> List[str]:
        """Generate searchable labels from filename"""
        base_name = filename.replace('.ply', '').replace('.PLY', '')
        labels = [base_name]
        
        # Split on common delimiters and add tokens
        tokens = re.split(r'[_\-\s]+', base_name.lower())
        tokens = [t for t in tokens if t and len(t) > 1]  # Filter short tokens
        
        # Add tokens as labels if they're meaningful
        for token in tokens:
            if token not in labels and token != base_name.lower():
                labels.append(token)
        
        return labels
    
    def scan_ply_files(self) -> List[Path]:
        """Scan directory for PLY files"""
        ply_files = []
        
        if not self.ply_directory.exists():
            print(f"Directory {self.ply_directory} does not exist")
            return ply_files
        
        for file in self.ply_directory.glob('*.ply'):
            if file.is_file():
                ply_files.append(file)
        
        # Also check for .PLY (uppercase)
        for file in self.ply_directory.glob('*.PLY'):
            if file.is_file():
                ply_files.append(file)
        
        return sorted(ply_files)
    
    def generate_info_json(self) -> Dict:
        """Generate complete info.json structure from all PLY files"""
        info = {
            'name': {},
            'bounding_box': {},
            'labels': {}
        }
        
        ply_files = self.scan_ply_files()
        
        if not ply_files:
            print(f"No PLY files found in {self.ply_directory}")
            return info
        
        print(f"Found {len(ply_files)} PLY file(s)")
        
        for ply_file in ply_files:
            filename = ply_file.name
            print(f"Processing {filename}...")
            
            # Generate object name (use filename as key)
            object_key = self.generate_object_name(filename)
            
            # Ensure unique keys
            original_key = object_key
            suffix = 1
            while object_key in info['name']:
                object_key = f"{original_key}_{suffix}"
                suffix += 1
            
            # Map object name to filename
            info['name'][object_key] = filename
            
            # Compute bounding box
            bbox = self.compute_bounding_box(ply_file)
            if bbox:
                # Store size only (not center, as frontend computes that)
                info['bounding_box'][object_key] = {
                    'x': bbox['x'],
                    'y': bbox['y'],
                    'z': bbox['z']
                }
            else:
                # Default bounding box if computation fails
                info['bounding_box'][object_key] = {
                    'x': 1.0,
                    'y': 1.0,
                    'z': 1.0
                }
            
            # Generate labels
            info['labels'][filename] = self.generate_labels(filename)
            
            print(f"  ✓ {object_key}: bbox={info['bounding_box'][object_key]}, labels={info['labels'][filename]}")
        
        return info
    
    def save_info_json(self, info: Dict) -> bool:
        """Save info.json to disk"""
        try:
            # Create output directory if needed
            self.output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.output_path, 'w') as f:
                json.dump(info, f, indent=2)
            
            print(f"✓ Saved info.json to {self.output_path}")
            return True
        except Exception as e:
            print(f"Error saving info.json: {e}")
            return False
    
    def process(self) -> bool:
        """Main processing function: scan PLY files and generate info.json"""
        print(f"Scanning PLY files in {self.ply_directory}...")
        info = self.generate_info_json()
        
        if not info['name']:
            print("No PLY files to process")
            return False
        
        return self.save_info_json(info)


def auto_generate_info_json(ply_directory: str, output_path: str) -> bool:
    """Convenience function to auto-generate info.json"""
    processor = PLYProcessor(ply_directory, output_path)
    return processor.process()


if __name__ == '__main__':
    # Test standalone
    import sys
    
    ply_dir = sys.argv[1] if len(sys.argv) > 1 else '../public'
    output = sys.argv[2] if len(sys.argv) > 2 else '../public/info.json'
    
    print("=" * 60)
    print("PLY Processor - Auto-generate info.json")
    print("=" * 60)
    
    success = auto_generate_info_json(ply_dir, output)
    
    if success:
        print("\n✓ Success! info.json has been generated.")
    else:
        print("\n✗ Failed to generate info.json")
        sys.exit(1)
