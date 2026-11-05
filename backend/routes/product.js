const express = require('express');
const router = express.Router();
const { Product } = require('../models/Product');

// =============================================
// GET ALL PRODUCTS
// =============================================
router.get('/', async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    
    const products = await Product.findAll({
      category,
      search,
      sort
    });
    
    // Format products for frontend
    const formattedProducts = products.map(product => ({
      _id: product.id,
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.original_price,
      discountPercent: product.discount_percent || 0,
      category: product.category,
      stock: product.stock || 10,
      description: product.description || '',
      image: product.image || '',
      imageUrl: product.image_url || '',
      images: product.images || [],
      brand: product.brand || '',
      weight: product.weight || null,
      color: product.color || '',
      size: product.size || '',
      material: product.material || '',
      warranty: product.warranty || '',
      tags: product.tags || [],
      icon: product.icon || '📦',
      rating: product.rating || 0,
      reviewsCount: product.reviews_count || 0,
      popularity: product.popularity || 0,
      promoCode: product.promo_code || '',
      promoDiscount: product.promo_discount || 0,
      isActive: product.is_active !== false,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
      mainImage: product.image || product.image_url || 
        (product.images && product.images.length > 0 ? product.images[0] : '')
    }));
    
    res.json({ success: true, products: formattedProducts });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching products' 
    });
  }
});

// =============================================
// GET SINGLE PRODUCT
// =============================================
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    // Format product for frontend
    const formattedProduct = {
      _id: product.id,
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.original_price,
      discountPercent: product.discount_percent || 0,
      category: product.category,
      stock: product.stock || 10,
      description: product.description || '',
      image: product.image || '',
      imageUrl: product.image_url || '',
      images: product.images || [],
      brand: product.brand || '',
      weight: product.weight || null,
      color: product.color || '',
      size: product.size || '',
      material: product.material || '',
      warranty: product.warranty || '',
      tags: product.tags || [],
      icon: product.icon || '📦',
      rating: product.rating || 0,
      reviewsCount: product.reviews_count || 0,
      popularity: product.popularity || 0,
      promoCode: product.promo_code || '',
      promoDiscount: product.promo_discount || 0,
      isActive: product.is_active !== false,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
      mainImage: product.image || product.image_url || 
        (product.images && product.images.length > 0 ? product.images[0] : '')
    };
    
    res.json({ success: true, product: formattedProduct });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching product' 
    });
  }
});

// =============================================
// ADD PRODUCT (Admin only)
// =============================================
router.post('/add', async (req, res) => {
  try {
    const {
      name,
      originalPrice,
      discountPercent,
      category,
      stock,
      description,
      icon,
      imageUrl,
      images,
      brand,
      weight,
      color,
      size,
      material,
      warranty,
      tags,
      promoCode,
      promoDiscount
    } = req.body;

    if (!name || !originalPrice) {
      return res.status(400).json({
        success: false,
        message: 'Name and original price are required'
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }

    const normalizedPromoCode = promoCode ? String(promoCode).trim().toUpperCase() : '';
    const normalizedPromoDiscount = parseFloat(promoDiscount) || 0;
    if ((normalizedPromoCode && (normalizedPromoDiscount <= 0 || normalizedPromoDiscount > 100)) ||
      (!normalizedPromoCode && normalizedPromoDiscount > 0)) {
      return res.status(400).json({
        success: false,
        message: 'Promo code and discount must both be provided, with discount between 1 and 100.'
      });
    }

    let finalPrice = parseFloat(originalPrice);
    const discount = parseFloat(discountPercent) || 0;
    
    if (discount > 0) {
      finalPrice = finalPrice - (finalPrice * (discount / 100));
    }

    let parsedImages = [];
    if (images) {
      try {
        parsedImages = typeof images === 'string' ? JSON.parse(images) : images;
      } catch (e) {
        parsedImages = images.split(',').map(img => img.trim());
      }
    }

    if (imageUrl && parsedImages.length === 0) {
      parsedImages = [imageUrl.trim()];
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim());
      }
    }

    const productData = {
      name: name.trim(),
      original_price: parseFloat(originalPrice),
      price: Math.round(finalPrice),
      discount_percent: discount,
      category: category || 'Groceries',
      stock: parseInt(stock) || 10,
      description: description || '',
      icon: icon || '📦',
      image: imageUrl.trim(),
      image_url: imageUrl.trim(),
      images: parsedImages,
      brand: brand || '',
      weight: weight || null,
      color: color || '',
      size: size || '',
      material: material || '',
      warranty: warranty || '',
      tags: parsedTags,
      promo_code: normalizedPromoCode,
      promo_discount: normalizedPromoDiscount,
      is_active: true
    };

    const product = await Product.create(productData);
    
    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      product: {
        _id: product.id,
        id: product.id,
        name: product.name,
        price: product.price,
        originalPrice: product.original_price,
        discountPercent: product.discount_percent || 0,
        category: product.category,
        stock: product.stock || 10,
        description: product.description || '',
        image: product.image || '',
        imageUrl: product.image_url || '',
        images: product.images || [],
        icon: product.icon || '📦',
        promoCode: product.promo_code || '',
        promoDiscount: product.promo_discount || 0
      }
    });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding product',
      error: error.message
    });
  }
});

// =============================================
// UPDATE PRODUCT (Admin only)
// =============================================
router.put('/update/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const updates = req.body;
    
    // Check if product exists
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Build update data
    const updateData = {};
    
    if (updates.name) updateData.name = updates.name.trim();
    if (updates.originalPrice) {
      updateData.original_price = parseFloat(updates.originalPrice);
      const disc = updates.discountPercent !== undefined ? 
        parseFloat(updates.discountPercent) : existingProduct.discount_percent;
      updateData.price = Math.round(updateData.original_price - 
        (updateData.original_price * (disc / 100)));
    }
    if (updates.discountPercent !== undefined) {
      updateData.discount_percent = parseFloat(updates.discountPercent);
      const origPrice = updateData.original_price || existingProduct.original_price;
      updateData.price = Math.round(origPrice - 
        (origPrice * (updateData.discount_percent / 100)));
    }
    if (updates.category) updateData.category = updates.category.trim();
    if (updates.stock !== undefined) updateData.stock = parseInt(updates.stock);
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.icon) updateData.icon = updates.icon;
    if (updates.imageUrl !== undefined) {
      updateData.image = updates.imageUrl.trim();
      updateData.image_url = updates.imageUrl.trim();
    }
    if (updates.images !== undefined) {
      try {
        updateData.images = typeof updates.images === 'string' ? 
          JSON.parse(updates.images) : updates.images;
      } catch (e) {
        updateData.images = updates.images.split(',').map(img => img.trim());
      }
    }
    if (updates.brand !== undefined) updateData.brand = updates.brand.trim();
    if (updates.weight !== undefined) updateData.weight = updates.weight || null;
    if (updates.color !== undefined) updateData.color = updates.color.trim();
    if (updates.size !== undefined) updateData.size = updates.size.trim();
    if (updates.material !== undefined) updateData.material = updates.material.trim();
    if (updates.warranty !== undefined) updateData.warranty = updates.warranty.trim();
    if (updates.tags !== undefined) {
      try {
        updateData.tags = typeof updates.tags === 'string' ? 
          JSON.parse(updates.tags) : updates.tags;
      } catch (e) {
        updateData.tags = updates.tags.split(',').map(t => t.trim());
      }
    }
    if (updates.promoCode !== undefined) {
      updateData.promo_code = String(updates.promoCode).trim().toUpperCase();
    }
    if (updates.promoDiscount !== undefined) {
      updateData.promo_discount = Math.min(100, Math.max(0, parseFloat(updates.promoDiscount) || 0));
    }

    const product = await Product.update(productId, updateData);
    
    res.json({
      success: true,
      message: 'Product updated successfully',
      product: {
        _id: product.id,
        id: product.id,
        name: product.name,
        price: product.price,
        originalPrice: product.original_price,
        discountPercent: product.discount_percent || 0,
        category: product.category,
        stock: product.stock || 10,
        description: product.description || '',
        image: product.image || '',
        imageUrl: product.image_url || '',
        images: product.images || [],
        icon: product.icon || '📦',
        promoCode: product.promo_code || '',
        promoDiscount: product.promo_discount || 0
      }
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating product' 
    });
  }
});

// =============================================
// DELETE PRODUCT (Admin only)
// =============================================
router.delete('/delete/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    await Product.delete(req.params.id);
    
    res.json({ 
      success: true, 
      message: 'Product deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting product' 
    });
  }
});

module.exports = router;
