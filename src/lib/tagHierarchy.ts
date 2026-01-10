import { Tag } from '@/types/database';

/**
 * Hierarchical tag utilities
 * Provides color variation based on hierarchy depth and parent-child relationships
 */

export interface HierarchicalTag extends Tag {
  children?: HierarchicalTag[];
  parentChain?: Tag[];
}

/**
 * Parse HSL color string or hex to HSL values
 */
function parseColor(color: string): { h: number; s: number; l: number } | null {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
  }
  
  // Handle HSL
  const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (hslMatch) {
    return {
      h: parseInt(hslMatch[1]),
      s: parseInt(hslMatch[2]),
      l: parseInt(hslMatch[3]),
    };
  }
  
  return null;
}

/**
 * Convert HSL to hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Get color variation for child tag based on depth
 * Keeps same hue, varies lightness
 */
export function getHierarchicalColor(tag: Tag, allTags: Tag[]): string {
  if (!tag.parent_id) {
    return tag.color;
  }
  
  // Find the root parent to get base hue
  let rootTag = tag;
  let currentTag: Tag | undefined = tag;
  
  while (currentTag?.parent_id) {
    const parent = allTags.find(t => t.id === currentTag!.parent_id);
    if (parent) {
      rootTag = parent;
      currentTag = parent;
    } else {
      break;
    }
  }
  
  const parsed = parseColor(rootTag.color);
  if (!parsed) return tag.color;
  
  // Vary lightness based on depth: deeper = lighter
  // Base lightness around 50%, each level adds 10% up to 80%
  const baseLightness = 45;
  const lightnessStep = 12;
  const maxLightness = 75;
  const newLightness = Math.min(baseLightness + (tag.depth * lightnessStep), maxLightness);
  
  // Keep saturation relatively high but slightly decrease for deeper levels
  const saturation = Math.max(parsed.s - (tag.depth * 5), 50);
  
  return hslToHex(parsed.h, saturation, newLightness);
}

/**
 * Build hierarchical tree from flat tag list
 */
export function buildTagTree(tags: Tag[]): HierarchicalTag[] {
  const tagMap = new Map<string, HierarchicalTag>();
  const roots: HierarchicalTag[] = [];
  
  // First pass: create map with empty children arrays
  tags.forEach(tag => {
    tagMap.set(tag.id, { ...tag, children: [], parentChain: [] });
  });
  
  // Second pass: build parent chains and tree structure
  tags.forEach(tag => {
    const hierarchicalTag = tagMap.get(tag.id)!;
    
    // Build parent chain
    const chain: Tag[] = [];
    let currentId = tag.parent_id;
    while (currentId) {
      const parent = tagMap.get(currentId);
      if (parent) {
        chain.unshift(parent);
        currentId = parent.parent_id;
      } else {
        break;
      }
    }
    hierarchicalTag.parentChain = chain;
    
    if (tag.parent_id) {
      const parent = tagMap.get(tag.parent_id);
      if (parent) {
        parent.children!.push(hierarchicalTag);
      } else {
        // Parent not found, treat as root
        roots.push(hierarchicalTag);
      }
    } else {
      roots.push(hierarchicalTag);
    }
  });
  
  return roots;
}

/**
 * Get all descendants of a tag
 */
export function getTagDescendants(tagId: string, tags: Tag[]): Tag[] {
  const descendants: Tag[] = [];
  const directChildren = tags.filter(t => t.parent_id === tagId);
  
  directChildren.forEach(child => {
    descendants.push(child);
    descendants.push(...getTagDescendants(child.id, tags));
  });
  
  return descendants;
}

/**
 * Get parent chain for a tag (breadcrumb)
 */
export function getTagParentChain(tag: Tag, allTags: Tag[]): Tag[] {
  const chain: Tag[] = [];
  let currentTag: Tag | undefined = tag;
  
  while (currentTag?.parent_id) {
    const parent = allTags.find(t => t.id === currentTag!.parent_id);
    if (parent) {
      chain.unshift(parent);
      currentTag = parent;
    } else {
      break;
    }
  }
  
  return chain;
}

/**
 * Flatten hierarchical tree for display (with indentation info)
 */
export function flattenTagTree(roots: HierarchicalTag[]): HierarchicalTag[] {
  const result: HierarchicalTag[] = [];
  
  function traverse(tags: HierarchicalTag[]) {
    // Sort by name
    const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(tag => {
      result.push(tag);
      if (tag.children && tag.children.length > 0) {
        traverse(tag.children);
      }
    });
  }
  
  traverse(roots);
  return result;
}
