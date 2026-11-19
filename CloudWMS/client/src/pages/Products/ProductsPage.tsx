import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Plus,
  Search,
  Trash2,
  X,
  Boxes,
  RotateCw,
  Upload,
  ImageOff,
  Image as ImageIcon,
} from 'lucide-react';
import {
  getProducts,
  createProduct,
  deleteProduct,
  uploadProductImage,
  deleteProductImage,
  getCategories,
  apiErrorMessage,
} from '../../services/api';
import type { Product, CreateProductPayload, Category } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const NEW_CATEGORY = '__new__';

export default function ProductsPage() {
  const { can } = useAuth();
  const canEdit = can('editProducts');
  const canDelete = can('deleteProducts');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const emptyForm: CreateProductPayload = {
    sku: '',
    name: '',
    description: '',
    category: '',
    unitOfMeasurement: 'pcs',
    minimumStockLevel: 5,
  };
  const [formData, setFormData] = useState<CreateProductPayload>(emptyForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const setImage = (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const openCreateModal = async () => {
    setFormError(null);
    setFormData(emptyForm);
    setImage(null);
    setIsModalOpen(true);
    try {
      const cats = await getCategories();
      setCategories(cats);
      setIsNewCategory(cats.length === 0);
      setFormData((f) => ({ ...f, category: cats[0]?.name ?? '' }));
    } catch {
      // Categories are a convenience; fall back to typing a new one
      setCategories([]);
      setIsNewCategory(true);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setImage(null);
  };

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setFormError('Image must be JPEG, PNG, WebP or GIF');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFormError('Image must be 5 MB or smaller');
      return;
    }
    setFormError(null);
    setImage(file);
  };

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProducts({ search });
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.category.trim()) {
      setFormError('Choose a category or enter a new one');
      return;
    }
    setSubmitting(true);
    let created: Product;
    try {
      created = await createProduct({
        ...formData,
        category: formData.category.trim(),
        sku: formData.sku.toUpperCase().trim(),
        minimumStockLevel: Number(formData.minimumStockLevel),
      });
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Failed to create product'));
      setSubmitting(false);
      return;
    }

    // The product exists from here on; an image failure must not hide that.
    if (imageFile) {
      try {
        await uploadProductImage(created.id, imageFile);
      } catch (err) {
        alert(
          `Product "${created.name}" was created, but the image upload failed: ` +
            apiErrorMessage(err, 'unknown error') +
            '. You can upload it from the product list.',
        );
      }
    }
    setSubmitting(false);
    closeModal();
    loadProducts();
  };

  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const replaceProduct = (updated: Product) =>
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

  const handleImageUpload = async (id: string, file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      alert('Image must be 5 MB or smaller');
      return;
    }
    setUploadingId(id);
    try {
      replaceProduct(await uploadProductImage(id, file));
    } catch (err) {
      alert(apiErrorMessage(err, 'Image upload failed'));
    } finally {
      setUploadingId(null);
    }
  };

  const handleImageRemove = async (id: string) => {
    try {
      replaceProduct(await deleteProductImage(id));
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to remove image'));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete product "${name}"?`)) return;
    try {
      await deleteProduct(id);
      loadProducts();
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to delete product'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Product Catalog</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered warehouse SKUs, categories, and inventory reorder points.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={loadProducts}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            title="Refresh"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canEdit && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU, product name, or description..."
            className="w-full text-xs pl-9 pr-4 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">SKU</th>
                <th className="px-6 py-3.5">Product Name</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Stock on Hand</th>
                <th className="px-6 py-3.5">Min Level</th>
                <th className="px-6 py-3.5">Unit</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Loading warehouse products...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No products found. Click <strong>"Add Product"</strong> to register your first SKU!
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-blue-600">{product.sku}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-4 h-4 text-slate-300" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">{product.name}</div>
                          {product.description && (
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">
                              {product.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        {product.category?.name ?? 'General'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-bold font-mono text-slate-800">
                        <Boxes className="w-3.5 h-3.5 text-slate-400" />
                        <span title={product.stockByWarehouse.map((w) => `${w.code}: ${w.quantityOnHand}`).join('\n') || 'No stock yet'}>
                          {product.totalQuantity}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500 font-medium">
                      {product.minimumStockLevel}
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-medium">
                      {product.unitOfMeasurement}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {!canEdit && !canDelete && <span className="text-[10px] text-slate-300">View only</span>}
                      {canEdit && (<>
                      <label
                        className={`inline-flex p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer ${uploadingId === product.id ? 'opacity-50 pointer-events-none' : ''}`}
                        title={product.imageKey ? 'Replace image' : 'Upload image'}
                      >
                        <Upload className={`w-4 h-4 ${uploadingId === product.id ? 'animate-pulse' : ''}`} />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) handleImageUpload(product.id, file);
                          }}
                        />
                      </label>
                      {product.imageKey && (
                        <button
                          onClick={() => handleImageRemove(product.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
                          title="Remove image"
                        >
                          <ImageOff className="w-4 h-4" />
                        </button>
                      )}
                      </>)}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(product.id, product.name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Delete product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Register New Product</h3>
                  <p className="text-[11px] text-slate-400">Save to PostgreSQL with unique SKU</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    SKU Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="WMS-ITEM-001"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Category *
                  </label>
                  <select
                    value={isNewCategory ? NEW_CATEGORY : formData.category}
                    onChange={(e) => {
                      if (e.target.value === NEW_CATEGORY) {
                        setIsNewCategory(true);
                        setFormData({ ...formData, category: '' });
                      } else {
                        setIsNewCategory(false);
                        setFormData({ ...formData, category: e.target.value });
                      }
                    }}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.productCount})
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>+ New category…</option>
                  </select>
                  {isNewCategory && (
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={50}
                      placeholder="New category name"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="mt-2 w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wireless Barcode Scanner"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Technical specifications, location notes..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Unit of Measurement *
                  </label>
                  <select
                    value={formData.unitOfMeasurement}
                    onChange={(e) => setFormData({ ...formData, unitOfMeasurement: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="boxes">Boxes</option>
                    <option value="rolls">Rolls</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="pallets">Pallets</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Minimum Stock Level *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.minimumStockLevel}
                    onChange={(e) => setFormData({ ...formData, minimumStockLevel: Number(e.target.value) })}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Product Image
                </label>
                <div className="flex items-center gap-3">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Selected product"
                      className="w-14 h-14 rounded-lg object-cover border border-slate-200 bg-slate-50"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5" />
                      {imageFile ? 'Change image' : 'Choose image'}
                      <input
                        type="file"
                        accept={IMAGE_TYPES.join(',')}
                        className="hidden"
                        onChange={(e) => {
                          pickImage(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {imageFile ? (
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="truncate">
                          {imageFile.name} · {(imageFile.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => setImage(null)}
                          className="text-rose-500 hover:underline shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Optional · JPEG, PNG, WebP or GIF up to 5 MB · stored in S3
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50"
                >
                  {submitting
                    ? imageFile
                      ? 'Saving & uploading...'
                      : 'Saving to Database...'
                    : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
