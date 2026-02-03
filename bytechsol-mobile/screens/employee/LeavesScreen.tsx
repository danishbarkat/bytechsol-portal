import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import Icon3D from '../../components/Icon3D';

export default function LeavesScreen() {
    const { user } = useAuth();
    const [leaves, setLeaves] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchLeaves = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('leave_requests')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (!error && data) {
                setLeaves(data);
            }
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchLeaves();
        }, [user])
    );

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        fetchLeaves();
    }, []);

    const renderItem = ({ item }: { item: any }) => (
        <View className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm mb-3">
            <View className="flex-row justify-between items-start mb-2">
                <View>
                    <Text className="text-slate-900 font-bold text-lg">{item.reason}</Text>
                    <Text className="text-slate-500 text-xs font-semibold mt-1">
                        {item.start_date} → {item.end_date}
                    </Text>
                </View>
                <View className={`px-3 py-1 rounded-full ${item.status === 'Approved' ? 'bg-emerald-50' :
                        item.status === 'Rejected' ? 'bg-rose-50' : 'bg-amber-50'
                    }`}>
                    <Text className={`text-[10px] font-black uppercase tracking-widest ${item.status === 'Approved' ? 'text-emerald-600' :
                            item.status === 'Rejected' ? 'text-rose-600' : 'text-amber-600'
                        }`}>
                        {item.status}
                    </Text>
                </View>
            </View>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
            <View className="px-6 pt-4 pb-2 flex-row justify-between items-center">
                <Text className="text-2xl font-black text-slate-900">Leaves</Text>
                <TouchableOpacity
                    className="bg-blue-600 px-4 py-2 rounded-xl shadow-lg shadow-blue-500/30"
                    onPress={() => alert('New Leave Request UI to be implemented')}
                >
                    <Text className="text-white font-bold text-xs uppercase tracking-wider">New Request</Text>
                </TouchableOpacity>
            </View>
            <FlatList
                data={leaves}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={
                    <View className="items-center justify-center py-20">
                        <Text className="text-slate-400 font-bold">No leave requests found</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}
