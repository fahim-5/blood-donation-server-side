const mongoose = require('mongoose');
const logger = require('./../middleware/loggerMiddleware').logger;

// Analytics utility functions
const analyticsUtils = {
    // Calculate date range based on period
    calculateDateRange: (period, customStartDate = null, customEndDate = null) => {
        const endDate = customEndDate ? new Date(customEndDate) : new Date();
        let startDate = customStartDate ? new Date(customStartDate) : new Date();
        
        switch (period) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setDate(endDate.getDate() - 1);
                endDate.setHours(23, 59, 59, 999);
                break;
            case '7days':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30days':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90days':
                startDate.setDate(startDate.getDate() - 90);
                break;
            case '1year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            case 'custom':
                // Use provided custom dates
                if (!customStartDate || !customEndDate) {
                    throw new Error('Custom period requires both startDate and endDate');
                }
                startDate = new Date(customStartDate);
                endDate = new Date(customEndDate);
                break;
            default:
                // Default to last 30 days
                startDate.setDate(startDate.getDate() - 30);
        }
        
        return { startDate, endDate };
    },
    
    // Group data by time intervals
    groupByTimeInterval: (data, groupBy, dateField = 'createdAt') => {
        const grouped = {};
        
        data.forEach(item => {
            const date = new Date(item[dateField]);
            let key;
            
            switch (groupBy) {
                case 'hour':
                    key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:00`;
                    break;
                case 'day':
                    key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
                    break;
                case 'week':
                    const weekNumber = Math.ceil(date.getDate() / 7);
                    key = `${date.getFullYear()}-W${weekNumber}`;
                    break;
                case 'month':
                    key = `${date.getFullYear()}-${date.getMonth() + 1}`;
                    break;
                case 'quarter':
                    const quarter = Math.floor(date.getMonth() / 3) + 1;
                    key = `${date.getFullYear()}-Q${quarter}`;
                    break;
                case 'year':
                    key = `${date.getFullYear()}`;
                    break;
                default:
                    key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
            }
            
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(item);
        });
        
        return grouped;
    },
    
    // Calculate growth percentage
    calculateGrowth: (current, previous) => {
        if (previous === 0) {
            return current > 0 ? 100 : 0;
        }
        return ((current - previous) / previous) * 100;
    },
    
    // Calculate averages
    calculateAverage: (values) => {
        if (!values || values.length === 0) return 0;
        const sum = values.reduce((a, b) => a + b, 0);
        return sum / values.length;
    },
    
    // Calculate median
    calculateMedian: (values) => {
        if (!values || values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        
        if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
        }
        
        return sorted[middle];
    },
    
    // Calculate standard deviation
    calculateStandardDeviation: (values) => {
        if (!values || values.length === 0) return 0;
        
        const avg = analyticsUtils.calculateAverage(values);
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = analyticsUtils.calculateAverage(squareDiffs);
        
        return Math.sqrt(avgSquareDiff);
    },
    
    // Calculate conversion rate
    calculateConversionRate: (conversions, total) => {
        if (total === 0) return 0;
        return (conversions / total) * 100;
    },
    
    // Calculate retention rate
    calculateRetentionRate: (retained, total) => {
        if (total === 0) return 0;
        return (retained / total) * 100;
    },
    
    // Calculate churn rate
    calculateChurnRate: (lost, total) => {
        if (total === 0) return 0;
        return (lost / total) * 100;
    },
    
    // Calculate completion rate
    calculateCompletionRate: (completed, started) => {
        if (started === 0) return 0;
        return (completed / started) * 100;
    },
    
    // Calculate fulfillment rate
    calculateFulfillmentRate: (fulfilled, requested) => {
        if (requested === 0) return 0;
        return (fulfilled / requested) * 100;
    },
    
    // Calculate response time statistics
    calculateResponseTimeStats: (responseTimes) => {
        if (!responseTimes || responseTimes.length === 0) {
            return {
                average: 0,
                median: 0,
                min: 0,
                max: 0,
                stdDev: 0,
                total: 0
            };
        }
        
        const average = analyticsUtils.calculateAverage(responseTimes);
        const median = analyticsUtils.calculateMedian(responseTimes);
        const min = Math.min(...responseTimes);
        const max = Math.max(...responseTimes);
        const stdDev = analyticsUtils.calculateStandardDeviation(responseTimes);
        
        return {
            average,
            median,
            min,
            max,
            stdDev,
            total: responseTimes.length
        };
    },
    
    // Generate time series data
    generateTimeSeries: (startDate, endDate, interval, data = [], valueField = 'value') => {
        const timeSeries = [];
        const currentDate = new Date(startDate);
        
        // Create all time intervals in the range
        while (currentDate <= endDate) {
            const timeKey = analyticsUtils.getTimeKey(currentDate, interval);
            timeSeries.push({
                time: timeKey,
                date: new Date(currentDate),
                [valueField]: 0
            });
            
            // Move to next interval
            switch (interval) {
                case 'hour':
                    currentDate.setHours(currentDate.getHours() + 1);
                    break;
                case 'day':
                    currentDate.setDate(currentDate.getDate() + 1);
                    break;
                case 'week':
                    currentDate.setDate(currentDate.getDate() + 7);
                    break;
                case 'month':
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    break;
                default:
                    currentDate.setDate(currentDate.getDate() + 1);
            }
        }
        
        // Fill with actual data
        const groupedData = analyticsUtils.groupByTimeInterval(data, interval);
        
        timeSeries.forEach(point => {
            const dataForTime = groupedData[point.time];
            if (dataForTime) {
                point[valueField] = dataForTime.length;
            }
        });
        
        return timeSeries;
    },
    
    // Get time key for grouping
    getTimeKey: (date, interval) => {
        const d = new Date(date);
        
        switch (interval) {
            case 'hour':
                return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:00`;
            case 'day':
                return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            case 'week':
                const weekNumber = Math.ceil(d.getDate() / 7);
                return `${d.getFullYear()}-W${weekNumber}`;
            case 'month':
                return `${d.getFullYear()}-${d.getMonth() + 1}`;
            case 'quarter':
                const quarter = Math.floor(d.getMonth() / 3) + 1;
                return `${d.getFullYear()}-Q${quarter}`;
            case 'year':
                return `${d.getFullYear()}`;
            default:
                return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        }
    },
    
    // Calculate geographical distribution
    calculateGeographicDistribution: (data, locationField = 'district') => {
        const distribution = {};
        let total = 0;
        
        data.forEach(item => {
            const location = item[locationField];
            if (location) {
                distribution[location] = (distribution[location] || 0) + 1;
                total++;
            }
        });
        
        // Calculate percentages
        const result = Object.keys(distribution).map(location => ({
            location,
            count: distribution[location],
            percentage: (distribution[location] / total) * 100
        }));
        
        // Sort by count descending
        result.sort((a, b) => b.count - a.count);
        
        return {
            data: result,
            total,
            uniqueLocations: result.length
        };
    },
    
    // Calculate blood group distribution
    calculateBloodGroupDistribution: (data, bloodGroupField = 'bloodGroup') => {
        const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
        const distribution = {};
        let total = 0;
        
        // Initialize all blood groups with 0
        bloodGroups.forEach(group => {
            distribution[group] = 0;
        });
        
        // Count occurrences
        data.forEach(item => {
            const bloodGroup = item[bloodGroupField];
            if (bloodGroup && distribution[bloodGroup] !== undefined) {
                distribution[bloodGroup]++;
                total++;
            }
        });
        
        // Format result
        const result = bloodGroups.map(group => ({
            bloodGroup: group,
            count: distribution[group],
            percentage: total > 0 ? (distribution[group] / total) * 100 : 0
        }));
        
        return {
            data: result,
            total,
            mostCommon: result.reduce((max, curr) => curr.count > max.count ? curr : max, { count: 0 }),
            leastCommon: result.reduce((min, curr) => curr.count < min.count ? curr : min, { count: Infinity })
        };
    },
    
    // Calculate user engagement score
    calculateEngagementScore: (userData) => {
        const {
            donationCount = 0,
            lastActivityDays = 0,
            responseRate = 0,
            completionRate = 0,
            accountAgeDays = 0
        } = userData;
        
        // Weights for different factors
        const weights = {
            donationFrequency: 0.3,
            recency: 0.25,
            responsiveness: 0.2,
            reliability: 0.15,
            tenure: 0.1
        };
        
        // Calculate individual scores (0-100)
        const donationScore = Math.min(donationCount * 10, 100); // Max 10 donations for perfect score
        const recencyScore = Math.max(0, 100 - (lastActivityDays * 2)); // Lose 2 points per day inactive
        const responsivenessScore = responseRate;
        const reliabilityScore = completionRate;
        const tenureScore = Math.min(accountAgeDays / 365 * 100, 100); // Max 1 year for perfect score
        
        // Calculate weighted score
        const engagementScore = 
            (donationScore * weights.donationFrequency) +
            (recencyScore * weights.recency) +
            (responsivenessScore * weights.responsiveness) +
            (reliabilityScore * weights.reliability) +
            (tenureScore * weights.tenure);
        
        // Determine engagement level
        let engagementLevel;
        if (engagementScore >= 80) engagementLevel = 'high';
        else if (engagementScore >= 50) engagementLevel = 'medium';
        else if (engagementScore >= 20) engagementLevel = 'low';
        else engagementLevel = 'inactive';
        
        return {
            score: Math.round(engagementScore),
            level: engagementLevel,
            components: {
                donation: Math.round(donationScore),
                recency: Math.round(recencyScore),
                responsiveness: Math.round(responsivenessScore),
                reliability: Math.round(reliabilityScore),
                tenure: Math.round(tenureScore)
            }
        };
    },
    
    // Calculate volunteer performance score
    calculateVolunteerPerformance: (volunteerData) => {
        const {
            tasksCompleted = 0,
            tasksAssigned = 0,
            avgResponseTime = 0,
            avgCompletionTime = 0,
            userRating = 0,
            daysActive = 0
        } = volunteerData;
        
        // Weights for different factors
        const weights = {
            completionRate: 0.3,
            efficiency: 0.25,
            responsiveness: 0.2,
            quality: 0.15,
            consistency: 0.1
        };
        
        // Calculate individual scores
        const completionRate = tasksAssigned > 0 ? (tasksCompleted / tasksAssigned) * 100 : 0;
        const completionRateScore = Math.min(completionRate, 100);
        
        // Efficiency score (lower completion time is better)
        const efficiencyScore = Math.max(0, 100 - (avgCompletionTime / 60)); // Lose 1 point per hour over target
        
        // Responsiveness score (lower response time is better)
        const responsivenessScore = Math.max(0, 100 - (avgResponseTime / 10)); // Lose 1 point per 10 minutes over target
        
        // Quality score based on user ratings
        const qualityScore = userRating * 20; // Convert 5-star rating to 0-100
        
        // Consistency score (based on days active)
        const consistencyScore = Math.min(daysActive, 100); // Max 100 days for perfect score
        
        // Calculate weighted score
        const performanceScore = 
            (completionRateScore * weights.completionRate) +
            (efficiencyScore * weights.efficiency) +
            (responsivenessScore * weights.responsiveness) +
            (qualityScore * weights.quality) +
            (consistencyScore * weights.consistency);
        
        // Determine performance level
        let performanceLevel;
        if (performanceScore >= 90) performanceLevel = 'excellent';
        else if (performanceScore >= 75) performanceLevel = 'good';
        else if (performanceScore >= 60) performanceLevel = 'average';
        else if (performanceScore >= 40) performanceLevel = 'needs_improvement';
        else performanceLevel = 'poor';
        
        return {
            score: Math.round(performanceScore),
            level: performanceLevel,
            components: {
                completionRate: Math.round(completionRateScore),
                efficiency: Math.round(efficiencyScore),
                responsiveness: Math.round(responsivenessScore),
                quality: Math.round(qualityScore),
                consistency: Math.round(consistencyScore)
            }
        };
    },
    
    // Generate predictive analytics
    generatePredictiveAnalytics: (historicalData, forecastDays = 30) => {
        if (!historicalData || historicalData.length < 7) {
            return {
                success: false,
                message: 'Insufficient historical data for prediction'
            };
        }
        
        try {
            // Simple linear regression for prediction
            const data = historicalData.map((item, index) => ({
                x: index,
                y: item.value
            }));
            
            // Calculate linear regression
            const n = data.length;
            const sumX = data.reduce((sum, point) => sum + point.x, 0);
            const sumY = data.reduce((sum, point) => sum + point.y, 0);
            const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
            const sumX2 = data.reduce((sum, point) => sum + point.x * point.x, 0);
            
            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;
            
            // Generate predictions
            const predictions = [];
            const today = new Date();
            
            for (let i = 1; i <= forecastDays; i++) {
                const predictionDate = new Date(today);
                predictionDate.setDate(predictionDate.getDate() + i);
                
                const predictedValue = Math.max(0, slope * (n + i) + intercept);
                
                predictions.push({
                    date: predictionDate.toISOString().split('T')[0],
                    predictedValue: Math.round(predictedValue),
                    confidence: Math.max(0, 100 - (i * 2)) // Confidence decreases over time
                });
            }
            
            // Calculate accuracy metrics (if we have recent actual data)
            const recentActual = historicalData.slice(-7); // Last 7 days
            const recentPredicted = predictions.slice(0, 7);
            
            let mae = 0; // Mean Absolute Error
            let mape = 0; // Mean Absolute Percentage Error
            
            if (recentActual.length === recentPredicted.length) {
                const errors = recentActual.map((actual, idx) => {
                    const predicted = recentPredicted[idx].predictedValue;
                    return Math.abs(actual.value - predicted);
                });
                
                mae = analyticsUtils.calculateAverage(errors);
                
                const percentageErrors = recentActual.map((actual, idx) => {
                    const predicted = recentPredicted[idx].predictedValue;
                    return actual.value > 0 ? Math.abs((actual.value - predicted) / actual.value) * 100 : 0;
                });
                
                mape = analyticsUtils.calculateAverage(percentageErrors);
            }
            
            return {
                success: true,
                predictions,
                model: {
                    slope,
                    intercept,
                    rSquared: null, // Would need more data for R²
                    forecastDays
                },
                accuracy: {
                    mae: Math.round(mae * 100) / 100,
                    mape: Math.round(mape * 100) / 100,
                    confidence: Math.round((100 - mape) * 100) / 100
                },
                next30DaysTotal: Math.round(predictions.reduce((sum, pred) => sum + pred.predictedValue, 0))
            };
        } catch (error) {
            logger.error(`Predictive analytics error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Calculate cohort analysis
    calculateCohortAnalysis: (users, startDate, endDate, cohortSize = 'monthly') => {
        // Group users by cohort (when they joined)
        const cohorts = {};
        
        users.forEach(user => {
            const joinDate = new Date(user.createdAt);
            let cohortKey;
            
            switch (cohortSize) {
                case 'weekly':
                    const weekNumber = Math.ceil(joinDate.getDate() / 7);
                    cohortKey = `${joinDate.getFullYear()}-W${weekNumber}`;
                    break;
                case 'monthly':
                    cohortKey = `${joinDate.getFullYear()}-${joinDate.getMonth() + 1}`;
                    break;
                case 'quarterly':
                    const quarter = Math.floor(joinDate.getMonth() / 3) + 1;
                    cohortKey = `${joinDate.getFullYear()}-Q${quarter}`;
                    break;
                default:
                    cohortKey = `${joinDate.getFullYear()}-${joinDate.getMonth() + 1}`;
            }
            
            if (!cohorts[cohortKey]) {
                cohorts[cohortKey] = {
                    users: [],
                    size: 0,
                    retention: {}
                };
            }
            
            cohorts[cohortKey].users.push(user);
            cohorts[cohortKey].size++;
        });
        
        // Calculate retention for each cohort
        Object.keys(cohorts).forEach(cohortKey => {
            const cohort = cohorts[cohortKey];
            const cohortStartDate = new Date(cohortKey.includes('W') 
                ? cohortKey.replace('W', '-W') 
                : cohortKey.replace('Q', '-Q'));
            
            // For each period after cohort start
            for (let period = 0; period <= 12; period++) {
                const periodEndDate = new Date(cohortStartDate);
                
                switch (cohortSize) {
                    case 'weekly':
                        periodEndDate.setDate(periodEndDate.getDate() + (period * 7));
                        break;
                    case 'monthly':
                        periodEndDate.setMonth(periodEndDate.getMonth() + period);
                        break;
                    case 'quarterly':
                        periodEndDate.setMonth(periodEndDate.getMonth() + (period * 3));
                        break;
                }
                
                // Count active users in this period
                const activeUsers = cohort.users.filter(user => {
                    const lastActivity = new Date(user.lastActivity || user.createdAt);
                    return lastActivity >= cohortStartDate && lastActivity <= periodEndDate;
                }).length;
                
                cohort.retention[`period_${period}`] = {
                    activeUsers,
                    retentionRate: cohort.size > 0 ? (activeUsers / cohort.size) * 100 : 0,
                    periodEnd: periodEndDate.toISOString()
                };
            }
        });
        
        return {
            cohorts,
            cohortSize,
            totalCohorts: Object.keys(cohorts).length,
            totalUsers: users.length
        };
    },
    
    // Generate insights from analytics data
    generateInsights: (analyticsData) => {
        const insights = [];
        
        // Check for significant changes
        if (analyticsData.growthRate && Math.abs(analyticsData.growthRate) > 20) {
            insights.push({
                type: analyticsData.growthRate > 0 ? 'positive' : 'negative',
                title: analyticsData.growthRate > 0 ? 'Significant Growth' : 'Significant Decline',
                message: analyticsData.growthRate > 0 
                    ? `${Math.abs(analyticsData.growthRate).toFixed(1)}% increase compared to previous period`
                    : `${Math.abs(analyticsData.growthRate).toFixed(1)}% decrease compared to previous period`,
                priority: 'high',
                metric: 'growthRate',
                value: analyticsData.growthRate
            });
        }
        
        // Check for completion rates
        if (analyticsData.completionRate && analyticsData.completionRate < 60) {
            insights.push({
                type: 'warning',
                title: 'Low Completion Rate',
                message: `Completion rate is ${analyticsData.completionRate.toFixed(1)}%, consider improving processes`,
                priority: 'medium',
                metric: 'completionRate',
                value: analyticsData.completionRate
            });
        }
        
        // Check for response times
        if (analyticsData.avgResponseTime && analyticsData.avgResponseTime > 3600) { // More than 1 hour
            insights.push({
                type: 'warning',
                title: 'Slow Response Times',
                message: `Average response time is ${Math.round(analyticsData.avgResponseTime / 60)} minutes`,
                priority: 'medium',
                metric: 'responseTime',
                value: analyticsData.avgResponseTime
            });
        }
        
        // Check for geographical distribution
        if (analyticsData.geographicDistribution) {
            const topLocation = analyticsData.geographicDistribution.data[0];
            if (topLocation && topLocation.percentage > 50) {
                insights.push({
                    type: 'info',
                    title: 'Geographic Concentration',
                    message: `${topLocation.location} accounts for ${topLocation.percentage.toFixed(1)}% of activity`,
                    priority: 'low',
                    metric: 'geographicConcentration',
                    value: topLocation.percentage
                });
            }
        }
        
        // Check for blood group distribution
        if (analyticsData.bloodGroupDistribution) {
            const leastCommon = analyticsData.bloodGroupDistribution.leastCommon;
            if (leastCommon && leastCommon.percentage < 5) {
                insights.push({
                    type: 'info',
                    title: 'Rare Blood Group',
                    message: `${leastCommon.bloodGroup} is the least common blood group at ${leastCommon.percentage.toFixed(1)}%`,
                    priority: 'low',
                    metric: 'rareBloodGroup',
                    value: leastCommon.percentage
                });
            }
        }
        
        // Sort insights by priority
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        insights.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
        
        return insights;
    }
};

module.exports = analyticsUtils;