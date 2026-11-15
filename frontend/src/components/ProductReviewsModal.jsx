import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE as API_URL, BACKEND_ORIGIN } from '../config/app';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const REVIEW_CACHE_KEY_PREFIX = 'velqra_product_reviews_';
const MAX_CACHED_REVIEWS = 30;

const readReviewCache = (productId) => {
  try {
    const cached = JSON.parse(localStorage.getItem(`${REVIEW_CACHE_KEY_PREFIX}${productId}`) || 'null');
    return cached && Array.isArray(cached.reviews) ? cached : null;
  } catch {
    return null;
  }
};

const writeReviewCache = (productId, cache) => {
  try {
    localStorage.setItem(`${REVIEW_CACHE_KEY_PREFIX}${productId}`, JSON.stringify({
      ...cache,
      reviews: (cache.reviews || []).filter(review => !review.is_demo).slice(0, MAX_CACHED_REVIEWS),
      cachedAt: Date.now()
    }));
  } catch {
    // Review caching is optional; the database response remains authoritative.
  }
};

const DEMO_REVIEW_TEMPLATES = [
  {
    id: 'demo-review-1',
    user_name: 'Demo Customer 1',
    rating: 5,
    review_text: 'Demo sample: gentle texture and easy to use in a daily routine.'
  },
  {
    id: 'demo-review-2',
    user_name: 'Demo Customer 2',
    rating: 4,
    review_text: 'Demo sample: the product feels pleasant to use.'
  },
  {
    id: 'demo-review-3',
    user_name: 'Demo Customer 3',
    rating: 5,
    review_text: 'Demo sample: a nice addition to my skincare routine.'
  }
];

export const getDemoReviews = (product) => {
  const reviewCount = Number(product?.reviewsCount ?? product?.reviews_count ?? 0);
  const rating = Number(product?.rating ?? 0);
  if (!import.meta.env.DEV || reviewCount > 0 || rating > 0) return [];
  return DEMO_REVIEW_TEMPLATES.map(review => ({
    ...review,
    is_demo: true,
    is_verified_purchase: false,
    created_at: '2026-11-15T00:00:00.000Z'
  }));
};

export const getDemoReviewSummary = (product) => {
  const demoReviews = getDemoReviews(product);
  return {
    rating: demoReviews.length
      ? Math.round((demoReviews.reduce((sum, review) => sum + review.rating, 0) / demoReviews.length) * 10) / 10
      : 0,
    reviewsCount: demoReviews.length
  };
};

export const ReviewStars = ({ value, size = 'text-lg' }) => (
  <span className={`${size} whitespace-nowrap`} aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(star => (
      <span key={star} className={star <= Math.round(Number(value) || 0) ? 'text-amber-500' : 'text-slate-300'}>
        ★
      </span>
    ))}
  </span>
);

const getReviewImageUrl = (url) => (
  url && /^https?:\/\//i.test(url) ? url : `${BACKEND_ORIGIN}${url || ''}`
);

export default function ProductReviewsModal({ product, onClose, onLoginRequest, onReviewsUpdated }) {
  const productId = product?._id || product?.id;
  const [reviews, setReviews] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [reviewSummary, setReviewSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [refreshWarning, setRefreshWarning] = useState('');
  const [moreError, setMoreError] = useState('');
  const [formError, setFormError] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [image, setImage] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let active = true;
    const cachedPage = readReviewCache(productId);
    if (cachedPage) {
      const cachedReviews = cachedPage.reviews.length
        ? cachedPage.reviews
        : getDemoReviews(product);
      setReviews(cachedReviews);
      setReviewSummary({
        rating: Number(cachedPage.rating ?? product.rating ?? 0),
        reviewsCount: Number(cachedPage.total ?? product.reviewsCount ?? product.reviews_count ?? cachedReviews.length)
      });
      setHasMore(Boolean(cachedPage.hasMore));
      setLoading(false);
    }

    const loadReviews = async () => {
      if (!cachedPage) setLoading(true);
      setError('');
      setRefreshWarning('');
      setEligibility(null);
      if (!cachedPage) {
        setReviewSummary(null);
        setHasMore(false);
      }
      try {
        const { data } = await axios.get(`${API_URL}/products/${productId}/reviews`, {
          params: { limit: 10, offset: 0 }
        });
        if (!data.success) throw new Error(data.message || 'Could not load reviews.');
        if (active) {
          const realReviews = data.reviews || [];
          const loadedReviews = realReviews.length ? realReviews : getDemoReviews(product);
          const knownReviewCount = Number(product.reviewsCount ?? product.reviews_count ?? 0);
          const loadedCount = realReviews.length
            ? Math.max(Number(data.total ?? knownReviewCount), realReviews.length)
            : Math.max(loadedReviews.length, knownReviewCount);
          const loadedRating = (realReviews.length || knownReviewCount > 0) && Number.isFinite(Number(product.rating))
            ? Number(product.rating)
            : loadedCount
            ? Math.round((loadedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / loadedCount) * 10) / 10
            : 0;
          setReviews(loadedReviews);
          setReviewSummary({ rating: loadedRating, reviewsCount: loadedCount });
          setHasMore(Boolean(data.hasMore));
          writeReviewCache(productId, {
            reviews: realReviews,
            total: loadedCount,
            rating: loadedRating,
            hasMore: Boolean(data.hasMore)
          });
        }
      } catch (loadError) {
        if (active && !cachedPage) {
          setError(loadError.response?.data?.message || loadError.message || 'Could not load reviews.');
        } else if (active) {
          setRefreshWarning('Could not refresh saved reviews. Showing the most recently cached results.');
        }
      } finally {
        if (active) setLoading(false);
      }

    };

    const loadEligibility = async () => {
      const token = sessionStorage.getItem('velqra_token');
      if (!token) return;
      try {
        const { data } = await axios.get(
          `${API_URL}/products/${productId}/reviews/eligibility`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (active && data.success) setEligibility(data);
      } catch {
        if (active) setEligibility({ error: 'Could not verify review eligibility. Please sign in again.' });
      }
    };

    loadReviews();
    loadEligibility();
    return () => {
      active = false;
    };
  }, [productId]);

  const loadMoreReviews = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setMoreError('');
    try {
      const { data } = await axios.get(`${API_URL}/products/${productId}/reviews`, {
        params: { limit: 10, offset: reviews.filter(review => !review.is_demo).length }
      });
      if (!data.success) throw new Error(data.message || 'Could not load more reviews.');
      setReviews(currentReviews => [
        ...currentReviews.filter(review => !review.is_demo),
        ...(data.reviews || [])
      ]);
      setHasMore(Boolean(data.hasMore));
      setReviewSummary(currentSummary => ({
        rating: Number.isFinite(Number(product.rating)) ? Number(product.rating) : currentSummary?.rating || 0,
        reviewsCount: Number(product.reviewsCount ?? product.reviews_count ?? currentSummary?.reviewsCount ?? 0)
      }));
      writeReviewCache(productId, {
        reviews: [
          ...reviews.filter(review => !review.is_demo),
          ...(data.reviews || [])
        ],
        total: Number(data.reviewsCount ?? reviewSummary?.reviewsCount ?? product.reviewsCount ?? product.reviews_count ?? reviews.length),
        rating: Number(data.rating ?? reviewSummary?.rating ?? product.rating ?? 0),
        hasMore: Boolean(data.hasMore)
      });
    } catch (loadError) {
      setMoreError(loadError.response?.data?.message || loadError.message || 'Could not load more reviews.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!rating) {
      setFormError('Choose a star rating before submitting.');
      return;
    }

    const token = sessionStorage.getItem('velqra_token');
    if (!token) {
      setFormError('Please sign in to submit a review.');
      return;
    }

    const formData = new FormData();
    formData.append('rating', String(rating));
    formData.append('reviewText', reviewText.trim());
    if (image) formData.append('image', image);

    setSubmitting(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/products/${productId}/reviews`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!data.success) throw new Error(data.message || 'Could not submit your review.');

      const updatedReviews = [data.review, ...reviews.filter(review => !review.is_demo)];
      const updatedReviewCount = Number(data.reviewsCount ?? reviewSummary?.reviewsCount ?? reviews.length + 1);
      setReviews(updatedReviews);
      setEligibility(current => ({ ...current, canReview: false, alreadyReviewed: true }));
      if (data.rating !== null && data.reviewsCount !== null &&
          Number.isFinite(Number(data.rating)) && Number.isFinite(Number(data.reviewsCount))) {
        setReviewSummary({ rating: Number(data.rating), reviewsCount: Number(data.reviewsCount) });
      }
      setRating(0);
      setReviewText('');
      setImage(null);
      setHasMore(updatedReviewCount > updatedReviews.length);
      onReviewsUpdated?.(productId, {
        rating: data.rating,
        reviewsCount: data.reviewsCount
      });
      writeReviewCache(productId, {
        reviews: updatedReviews,
        total: updatedReviewCount,
        rating: Number(data.rating ?? reviewSummary?.rating ?? product.rating ?? 0),
        hasMore: updatedReviewCount > updatedReviews.length
      });
    } catch (submitError) {
      setFormError(submitError.response?.data?.message || submitError.message || 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!product) return null;

  const productRating = Number(reviewSummary?.rating ?? product.rating ?? product.average_rating ?? 0);
  const reviewsCount = Number(reviewSummary?.reviewsCount ?? product.reviewsCount ?? product.reviews_count ?? reviews.length);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 sm:p-6"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-reviews-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer reviews</p>
            <h2 id="product-reviews-title" className="mt-1 truncate text-xl font-black text-slate-900">
              {product.name}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <ReviewStars value={productRating} />
              <span className="text-sm font-bold text-slate-700">
                {productRating ? productRating.toFixed(1) : 'No rating'} ({reviewsCount})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reviews"
            className="rounded-full px-3 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            ×
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-bold text-slate-900">Write a review</h3>
            {!sessionStorage.getItem('velqra_token') ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">Sign in and review after your order is delivered.</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLoginRequest?.();
                  }}
                  className="rounded-lg bg-[#0B3C5D] px-4 py-2 text-sm font-bold text-white hover:bg-[#07263b]"
                >
                  Sign in
                </button>
              </div>
            ) : eligibility?.error ? (
              <p role="alert" className="mt-3 text-sm text-red-600">{eligibility.error}</p>
            ) : eligibility?.alreadyReviewed ? (
              <p className="mt-3 text-sm text-slate-600">You have already reviewed this product.</p>
            ) : eligibility && !eligibility.canReview ? (
              <p className="mt-3 text-sm text-slate-600">A review is available after this product is delivered to you.</p>
            ) : eligibility?.canReview ? (
              <form onSubmit={handleSubmit} className="mt-3 space-y-3">
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">Your rating</p>
                  <div className="flex gap-1" role="group" aria-label="Choose a star rating">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        aria-label={`${star} star${star === 1 ? '' : 's'}`}
                        aria-pressed={rating === star}
                        className={`text-3xl leading-none transition ${star <= rating ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block text-xs font-semibold text-slate-600">
                  Comment (optional)
                  <textarea
                    value={reviewText}
                    onChange={event => setReviewText(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Share your experience with this product"
                    className="mt-1 block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0B3C5D]"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Product photo (optional, JPG/PNG/WebP up to 5 MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={event => {
                      const selected = event.target.files?.[0] || null;
                      if (selected && !ALLOWED_IMAGE_TYPES.includes(selected.type)) {
                        setFormError('Choose a JPG, PNG, or WebP image.');
                        event.target.value = '';
                        setImage(null);
                        return;
                      }
                      if (selected && selected.size > MAX_IMAGE_SIZE) {
                        setFormError('The photo must be 5 MB or smaller.');
                        event.target.value = '';
                        setImage(null);
                        return;
                      }
                      setFormError('');
                      setImage(selected);
                    }}
                    className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-bold file:text-[#0B3C5D]"
                  />
                </label>
                {formError && <p role="alert" className="text-sm font-medium text-red-600">{formError}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#173b32] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#102a24] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit review'}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Checking whether your order has been delivered…</p>
            )}
          </div>

          <h3 className="mb-1 text-lg font-black text-slate-900">
            All reviews ({reviewsCount})
          </h3>
          {!loading && !error && reviewsCount > 0 && (
            <p className="mb-3 text-xs text-slate-500">
              Showing {reviews.filter(review => !review.is_demo).length || reviews.length} of {reviewsCount}
            </p>
          )}
          {refreshWarning && (
            <p role="status" className="mb-3 text-xs text-amber-700">{refreshWarning}</p>
          )}
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading reviews…</p>
          ) : error ? (
            <p role="alert" className="py-6 text-center text-sm text-red-600">{error}</p>
          ) : reviews.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
              No reviews yet. Be the first to review after delivery.
            </p>
          ) : (
            <div className="space-y-4">
              {reviews.map(review => {
                const imageUrl = review.imageUrl || review.image_url;
                return (
                  <article key={review.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">
                          {review.user_name || 'Customer'}
                          {review.is_demo && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800">
                              Demo
                            </span>
                          )}
                        </p>
                        <ReviewStars value={review.rating} size="text-base" />
                      </div>
                      <div className="text-right">
                        {review.is_verified_purchase && (
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-green-700">Verified purchase</span>
                        )}
                        <time className="text-xs text-slate-500">
                          {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
                        </time>
                      </div>
                    </div>
                    {review.review_text && (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{review.review_text}</p>
                    )}
                    {imageUrl && (
                      <a
                        href={getReviewImageUrl(imageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block"
                      >
                        <img
                          src={getReviewImageUrl(imageUrl)}
                          alt={`Photo shared by ${review.user_name || 'customer'}`}
                          loading="lazy"
                          className="max-h-64 max-w-full rounded-lg border border-slate-200 object-contain"
                        />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {hasMore && (
            <div className="mt-5 text-center">
              {moreError && <p role="alert" className="mb-2 text-sm text-red-600">{moreError}</p>}
              <button
                type="button"
                onClick={loadMoreReviews}
                disabled={loadingMore}
                className="rounded-full border border-[#173b32] px-5 py-2 text-sm font-bold text-[#173b32] transition hover:bg-[#173b32] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more reviews'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
