/**
 * 通用树形结构转换工具
 */
export function treeify<T extends Record<string, any>>(
  list: T[],
  idKey: keyof T = 'id',
  parentKey: keyof T = 'parentId',
  childrenKey: string = 'children',
): T[] {
  type TreeNode = T & { [K in string]: any };
  const map = new Map<any, TreeNode>();
  const tree: TreeNode[] = [];

  list.forEach((item) => {
    map.set(item[idKey], { ...item, [childrenKey]: [] });
  });

  list.forEach((item) => {
    const parentId = item[parentKey];
    const mapItem = map.get(item[idKey]);
    if (!mapItem) return;

    if (parentId && map.has(parentId)) {
      const parent = map.get(parentId);
      if (parent && Array.isArray(parent[childrenKey])) {
        parent[childrenKey].push(mapItem);
      }
    } else {
      tree.push(mapItem);
    }
  });

  return tree;
}
