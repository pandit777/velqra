import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await api.getProducts();
      
      if (data.success) {
        setProducts(data.products);
      } else {
        setError(data.message || 'Failed to fetch products');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading products...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="products-grid">
      {products.map(product => (
        <div key={product.id || product._id} className="product-card">
          <img 
            src={product.image || product.imageUrl || product.mainImage} 
            alt={product.name}
            onError={(e) => {
              e.target.src = 'https://via.placeholder.com/300x300?text=No+Image';
            }}
          />
          <h3>{product.name}</h3>
          <div className="price">
            <span className="current">₹{product.price}</span>
            <span className="original">₹{product.originalPrice}</span>
            <span className="discount">{product.discountPercent}% OFF</span>
          </div>
          <button>Add to Cart</button>
        </div>
      ))}
    </div>
  );
}